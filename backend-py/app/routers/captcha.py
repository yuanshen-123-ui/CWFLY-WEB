"""/api/captcha —— 全隐身 PoW（Proof-of-Work）人机验证。

设计要点（与前端 `src/components/PoWCaptcha.vue` + `src/workers/pow.worker.js` 配套）：

1. GET  /api/captcha/challenge  下发 challenge（默认 5 分钟有效）
2. POST /api/captcha/verify     校验 `sha256(challenge + nonce)` 前导 0；
                                **验算前先 pop**（一次性，防重放），成功签发短期 JWT
3. require_pow_token            FastAPI 依赖：校验 `X-PoW-Token` 头里的短期 JWT

存储：默认使用**进程内内存字典**（`_CHALLENGES`）；若配置了 Redis
（`SOCKETIO_REDIS_URL` 或 `REDIS_URL`），额外镜像到 Redis —— 因为生产是多 worker，
challenge 与 verify 可能落在不同进程，内存字典会让隐身验证静默失败。Redis 不可用时
自动回退纯内存（功能仍可用，只是多 worker 之间存在概率性失败）。

防重放：内存 pop 是原子的；Redis 侧用 Lua 脚本 GET+DEL 原子弹出。
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import time
from typing import Any

import jwt as pyjwt
from fastapi import APIRouter, Depends, Request

from app.deps import AuthFailure
from app.services.key_rotation import get_signing_key, get_verifying_keys
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.captcha")

router = APIRouter(prefix="/captcha", tags=["captcha"])

# ===== 参数 =====
CHALLENGE_TTL_MS = 5 * 60 * 1000      # challenge 5 分钟有效
POW_TOKEN_TTL_SECONDS = 10 * 60       # 通过后签发的短期 JWT 有效期
DEFAULT_DIFFICULTY = 4                # 前导 0 的十六进制位数（4 ≈ 平均 6.5 万次哈希）
MAX_CHALLENGES = 20000                # 内存保护上限
POW_TOKEN_HEADER = "X-PoW-Token"

# ===== 内存存储（默认）=====
_CHALLENGES: dict[str, dict[str, Any]] = {}
_redis_client: Any = None
_redis_checked = False

_REDIS_POP_LUA = """
local v = redis.call('GET', KEYS[1])
if v then redis.call('DEL', KEYS[1]) end
return v
"""


def _redis() -> Any:
    """惰性或初始化 Redis；不可用则返回 None（回退内存）。"""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    url = (os.getenv("SOCKETIO_REDIS_URL") or os.getenv("REDIS_URL") or "").strip()
    if not url:
        return None
    try:
        import redis  # type: ignore

        client = redis.Redis.from_url(url, socket_timeout=0.3, socket_connect_timeout=0.3)
        client.ping()
        _redis_client = client
        log.info("[PoW] 使用 Redis 存储 challenge（多 worker 一致）")
    except Exception as exc:  # noqa: BLE001
        log.warning("[PoW] Redis 不可用，回退进程内存: %s", exc)
        _redis_client = None
    return _redis_client


def _redis_key(challenge: str) -> str:
    return "cwfly:pow:" + challenge


def _now_ms() -> int:
    return int(time.time() * 1000)


def _cleanup_memory(now_ms: int) -> None:
    """清理过期 challenge，防止内存无限增长。"""
    if len(_CHALLENGES) < MAX_CHALLENGES:
        return
    expired = [k for k, v in _CHALLENGES.items() if int(v["expires_at"]) <= now_ms]
    for key in expired:
        _CHALLENGES.pop(key, None)


def _store_challenge(challenge: str, record: dict[str, Any]) -> None:
    _CHALLENGES[challenge] = record
    _cleanup_memory(_now_ms())
    client = _redis()
    if client is not None:
        try:
            client.set(
                _redis_key(challenge),
                json.dumps(record, ensure_ascii=False),
                px=max(int(record["expires_at"]) - _now_ms(), 1000),
            )
        except Exception:  # noqa: BLE001
            pass


def _pop_challenge(challenge: str) -> dict[str, Any] | None:
    """一次性取出（验证开始就 pop，天然防重放）。"""
    record = _CHALLENGES.pop(challenge, None)
    client = _redis()
    if client is not None:
        try:
            raw = client.eval(_REDIS_POP_LUA, 1, _redis_key(challenge))
            if raw:
                return json.loads(raw)
        except Exception:  # noqa: BLE001
            pass
    return record


def _sha256_leading_zeros(raw: str, difficulty: int) -> bool:
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return digest.startswith("0" * difficulty)


def _sign_pow_token(sid: str) -> str:
    iat = int(time.time())
    payload = {
        "typ": "pow",
        "sid": sid,
        "iat": iat,
        "exp": iat + POW_TOKEN_TTL_SECONDS,
    }
    return pyjwt.encode(payload, get_signing_key(), algorithm="HS256")


def _verify_pow_token(token: str) -> dict[str, Any]:
    last: Exception | None = None
    for key in get_verifying_keys():
        try:
            decoded = pyjwt.decode(token, key, algorithms=["HS256"])
            if decoded.get("typ") != "pow":
                raise pyjwt.InvalidTokenError("not pow token")
            return decoded
        except pyjwt.InvalidTokenError as exc:
            last = exc
    raise AuthFailure(403, "人机验证已过期，请刷新页面后重试")


# ===== 接口 =====


@router.get("/challenge")
async def issue_challenge(request: Request) -> JSJSONResponse:
    """下发一次性 PoW challenge（5 分钟有效）。"""
    sid = secrets.token_hex(8)
    seed = secrets.token_hex(16)
    challenge = f"{sid}.{seed}"
    difficulty = DEFAULT_DIFFICULTY
    now = _now_ms()
    record = {
        "challenge": challenge,
        "sid": sid,
        "difficulty": difficulty,
        "issued_at": now,
        "expires_at": now + CHALLENGE_TTL_MS,
    }
    _store_challenge(challenge, record)
    return JSJSONResponse(
        {
            "success": True,
            "data": {
                "challenge": challenge,
                "difficulty": difficulty,
                "algorithm": "sha256",
                "expiresIn": CHALLENGE_TTL_MS // 1000,
                "header": POW_TOKEN_HEADER,
            },
        },
        headers={"Cache-Control": "no-store"},
    )


@router.post("/verify")
async def verify_challenge(request: Request) -> JSJSONResponse:
    """校验 PoW 解；验证前已 pop（防重放），通过后签发短期 JWT。"""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return JSJSONResponse({"success": False, "message": "请求参数错误"}, status_code=400)
    if not isinstance(body, dict):
        return JSJSONResponse({"success": False, "message": "请求参数错误"}, status_code=400)

    challenge = str(body.get("challenge") or "")
    nonce = str(body.get("nonce") or "")
    if not challenge or not nonce or len(nonce) > 64 or len(challenge) > 128:
        return JSJSONResponse({"success": False, "message": "请求参数错误"}, status_code=400)

    record = _pop_challenge(challenge)
    if record is None:
        return JSJSONResponse({"success": False, "message": "验证已过期，请刷新页面重试"}, status_code=400)

    now = _now_ms()
    if int(record.get("expires_at") or 0) <= now:
        return JSJSONResponse({"success": False, "message": "验证已过期，请刷新页面重试"}, status_code=400)

    difficulty = int(record.get("difficulty") or DEFAULT_DIFFICULTY)
    if not _sha256_leading_zeros(challenge + nonce, difficulty):
        return JSJSONResponse({"success": False, "message": "人机验证未通过"}, status_code=400)

    token = _sign_pow_token(str(record.get("sid") or ""))
    return JSJSONResponse(
        {
            "success": True,
            "token": token,
            "expiresIn": POW_TOKEN_TTL_SECONDS,
        },
        headers={"Cache-Control": "no-store"},
    )


async def require_pow_token(request: Request) -> dict[str, Any]:
    """FastAPI 依赖：要求请求携带有效的 `X-PoW-Token`（PoW 通过后签发的短期 JWT）。

    可用环境变量 `POW_ENFORCE=0` 紧急关闭拦截（放行不校验）。
    """
    if os.getenv("POW_ENFORCE", "1").strip().lower() in ("0", "false", "no"):
        return {}
    token = (request.headers.get(POW_TOKEN_HEADER) or "").strip()
    if not token:
        raise AuthFailure(403, "人机验证未通过，请刷新页面后重试")
    return _verify_pow_token(token)


@router.get("/status")
async def status(payload: dict[str, Any] = Depends(require_pow_token)) -> JSJSONResponse:
    """示例/自检接口：验证 require_pow_token 是否生效（前端也可用于探测）。"""
    return JSJSONResponse(
        {
            "success": True,
            "data": {"verified": True, "expiresAt": payload.get("exp"), "sid": payload.get("sid")},
        }
    )


__all__ = [
    "router",
    "require_pow_token",
    "CHALLENGE_TTL_MS",
    "POW_TOKEN_TTL_SECONDS",
    "DEFAULT_DIFFICULTY",
    "POW_TOKEN_HEADER",
]
