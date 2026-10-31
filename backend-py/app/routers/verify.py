"""/api/verify 路由（逐接口对齐 Node src/routes/verify.js）。

端点：
- POST /api/verify/send   发送邮箱验证码（限流 → 60s 冷却 → PoW → 邮箱占用 → 发信）
- POST /api/verify/check  校验邮箱验证码（一次性，通过即失效）

调用方：前端注册页 Register.vue（发送验证码）、登录二次验证 Login.vue。
依赖：app/services/mailer.py（等价 src/utils/mailer.js）、app/routers/captcha.py（PoW）。

限流（Node 侧定义在 security.js，被 verify.js import）：
- verifyLimiter   windowMs 15min, max 5,  key = 客户端 IP，message「验证码请求过于频繁，请稍后再试」
  ※ Node 里 /send 与 /check **共用同一个限流器实例**（同一 store/key），因此两者计数合并；
    这里用同一个 Limit 实例（scope 相同）复现该行为。
- codeFpLimiter   windowMs 24h,   max 10, key = `fp:<X-Device-Fp>`（无该头时退回客户端 IP），
  message「验证码发送过于频繁，请稍后再试」
"""
from __future__ import annotations

import logging
import math
import time
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.middleware.rate_limit import (
    Limit,
    RateLimitExceeded,
    _consume,  # 与 rate_limiter 同一个滑动窗口原语，仅换成「按设备指纹」作 key
    rate_limiter,
)
from app.services import users
from app.services.mailer import generate_code, send_verify_code, store_code, verify_code
from app.routers.captcha import require_pow_token
from app.utils.client import get_client_ip
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.verify")
router = APIRouter(prefix="/verify", tags=["verify"])

# ===== 验证码发送冷却（服务器强制）=====
# 数据源：复用 VerificationCode 表（跨实例共享），其 createdAt 即最近发送时间。
# 内存 Map 仅作数据库故障时的兜底（单实例内有效）——与 Node 完全一致。
SEND_COOLDOWN_MS = 60 * 1000
_email_cooldowns: dict[str, int] = {}  # email -> last_send_ms

# purpose 白名单（Node: new Set(['register', 'bind', 'login'])）
PURPOSES = frozenset({"register", "bind", "login"})

# ---- 限流器 ----
_VERIFY_LIMIT = Limit("verify-code-ip", 15 * 60, 5, "验证码请求过于频繁，请稍后再试")
verify_limiter = rate_limiter(_VERIFY_LIMIT)

_CODE_FP_LIMIT = Limit("verify-code-fp", 24 * 60 * 60, 10, "验证码发送过于频繁，请稍后再试")


async def code_fp_limiter(request: Request, response: Response) -> None:
    """对齐 Node codeFpLimiter 的 keyGenerator：`fp:<X-Device-Fp>`，无该头则按 IP。"""
    fp = request.headers.get("x-device-fp") or ""
    key = f"fp:{fp}" if fp else (get_client_ip(request) or "unknown")
    allowed, remaining, reset = _consume(_CODE_FP_LIMIT, key)
    response.headers["RateLimit-Limit"] = str(_CODE_FP_LIMIT.max_requests)
    response.headers["RateLimit-Remaining"] = str(remaining)
    response.headers["RateLimit-Reset"] = str(reset)
    if not allowed:
        raise RateLimitExceeded(_CODE_FP_LIMIT.message, _CODE_FP_LIMIT.max_requests, reset)


# ==================== 响应工具（与 Node res.json 等价） ====================
def ok(**extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    body.update(extra)
    return JSJSONResponse(body)


def fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


# ==================== 工具函数 ====================
def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(value: Any) -> int:
    """datetime（UTC，Prisma DATETIME）→ 毫秒时间戳（对齐 JS Date.getTime()）。"""
    import datetime as dt

    if isinstance(value, dt.datetime):
        naive = value.astimezone(dt.timezone.utc).replace(tzinfo=None) if value.tzinfo else value
        return int(naive.replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    return 0


async def _get_last_send(db: AsyncSession, email: str) -> int:
    """读取该邮箱最近一次发送验证码的时间戳（毫秒）；无记录/DB 异常返回内存兜底值。"""
    try:
        row = (
            await db.execute(
                text(
                    "SELECT `createdAt` FROM `VerificationCode` "
                    "WHERE email = :email ORDER BY `createdAt` DESC LIMIT 1"
                ),
                {"email": email},
            )
        ).first()
        if row is not None:
            last = _ms(row._mapping.get("createdAt"))
            if last:
                return last
    except Exception:  # noqa: BLE001 - 与 Node `catch {}` 一致：读不到就降级内存
        pass
    return int(_email_cooldowns.get(email) or 0)


def _set_last_send(email: str) -> None:
    """记录本次发送时间（仅覆盖「DB 不可用 / 验证码被删除」的边界场景）。"""
    _email_cooldowns[email] = _now_ms()


def _prune_memory_cache() -> None:
    """清理已过冷却期的内存记录，防止字典无限增长（Node 每 60s 定时 + 请求内惰性触发）。"""
    now = _now_ms()
    for email, ts in list(_email_cooldowns.items()):
        if now - ts >= SEND_COOLDOWN_MS:
            _email_cooldowns.pop(email, None)


def _smtp_unconfigured(exc: BaseException) -> bool:
    """Node: `mailErr.message === 'SMTP_NOT_CONFIGURED'`。

    Python 侧 aiosmtplib 的异常文案不同，因此同时检查「SMTP 未配置」这一事实。
    """
    if "SMTP_NOT_CONFIGURED" in str(exc):
        return True
    return not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL


def _with_rate_limit_headers(injected: Response, out: JSJSONResponse) -> JSJSONResponse:
    """把限流依赖写到注入 Response 上的 RateLimit-* 头搬到真正返回的响应上。

    FastAPI 在「路径函数返回 Response 对象」时不会合并注入的 Response，需手动搬运；
    等价 Node express-rate-limit 的 `standardHeaders: true`。
    """
    for name in ("RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"):
        value = injected.headers.get(name)
        if value is not None:
            out.headers[name] = value
    return out


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


# ==================== POST /send —— 发送邮箱验证码 ====================
@router.post(
    "/send",
    dependencies=[Depends(verify_limiter), Depends(code_fp_limiter), Depends(require_pow_token)],
)
async def send_code(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> Any:
    """守卫链：IP 限流 → 设备指纹限流 → 60s 冷却(DB) → PoW → 邮箱占用 → 发信。

    返回：200（带 cooldown:60）/ 400 / 404 / 409 / 429（带剩余秒 cooldown）/ 502 / 500。
    """

    def out(resp: JSJSONResponse) -> JSJSONResponse:
        """保留限流依赖写下的 RateLimit-* 响应头（等价 express-rate-limit standardHeaders）。"""
        return _with_rate_limit_headers(response, resp)

    try:
        body = await _json_body(request)
        email = body.get("email")
        if not email:
            return out(fail(400, "缺少邮箱地址"))
        email = str(email)

        # ===== purpose 白名单（Node H-1 修复①）=====
        purpose = body.get("purpose")
        p = purpose if isinstance(purpose, str) and purpose in PURPOSES else ""
        if not p:
            return out(fail(400, "参数错误"))

        _prune_memory_cache()  # 惰性清理内存降级缓存

        # ===== 服务器强制冷却（数据库，跨实例生效）=====
        last_send = await _get_last_send(db, email)
        remain = math.ceil((last_send + SEND_COOLDOWN_MS - _now_ms()) / 1000)
        if remain > 0:
            return out(fail(429, f"发送过于频繁，请 {remain} 秒后重试", cooldown=remain))

        # 人机验证：由 require_pow_token 依赖统一把关（Cloudflare Turnstile 已下线）
        if p == "login":
            # login：邮箱必须已绑定账号
            owner = await users.find_user_by_email(db, email)
            if not owner:
                return out(fail(404, "该邮箱未绑定任何账号"))

        # 检查邮箱是否已被绑定
        if p in ("register", "bind"):
            exists = await users.find_user_by_email(db, email)
            if exists and p == "register":
                return out(fail(409, "该邮箱已被注册"))

        code = generate_code()
        try:
            await send_verify_code(email, code, p)
        except Exception as mail_err:  # noqa: BLE001
            log.error("[邮件发送失败] %s", mail_err)
            # 仍然存储验证码，方便开发调试
            await store_code(email, code)
            msg = (
                "邮件服务未配置，请联系管理员设置 SMTP 后使用"
                if _smtp_unconfigured(mail_err)
                else "邮件发送失败，请检查邮箱地址或联系管理员"
            )
            return out(fail(502, msg))

        await store_code(email, code)
        _set_last_send(email)

        return out(ok(message="验证码已发送", cooldown=60))
    except Exception:  # noqa: BLE001
        log.exception("[验证码发送接口错误]")
        return out(fail(500, "服务器内部错误，请稍后重试"))


# ==================== POST /check —— 校验邮箱验证码 ====================
@router.post("/check", dependencies=[Depends(verify_limiter)])
async def check_code(request: Request, response: Response) -> Any:
    """校验用户输入的验证码是否与该邮箱匹配且未过期；校验通过即删除（一次性）。"""
    try:
        body = await _json_body(request)
        email = body.get("email")
        code = body.get("code")
        if not email or not code:
            return _with_rate_limit_headers(response, fail(400, "缺少参数"))

        if not await verify_code(str(email), str(code)):
            return _with_rate_limit_headers(response, fail(400, "验证码错误或已过期"))

        return _with_rate_limit_headers(response, ok(message="验证通过"))
    except Exception:  # noqa: BLE001
        log.exception("[verify.js]")
        return _with_rate_limit_headers(response, fail(500, "操作失败"))


__all__ = ["router", "verify_limiter", "code_fp_limiter"]
