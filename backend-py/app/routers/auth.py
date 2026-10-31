"""/api/auth 路由（逐接口对齐 Node src/routes/auth.js）。

路径 / 方法 / 请求体 / 响应 JSON 结构 / 状态码 / 中文文案均与 Node 版一致。
灰度切流：nginx 先 `location /api/auth/ { proxy_pass http://python_backend; }`。
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import AuthFailure, CurrentUser, get_current_user
from app.routers.captcha import require_pow_token
from app.middleware.rate_limit import login_limiter, register_limiter, sensitive_limiter
from app.services import users
from app.services.device_ban import is_device_banned
from app.services.login_lock import check_login_lock, clear_login_failures, record_login_failure
from app.services.mailer import (
    fire_and_forget,
    generate_code,
    send_notification,
    send_security_alert,
    send_verify_code,
    store_code,
    verify_code,
)
from app.services.token import (
    TokenError,
    TokenExpiredError,
    sign_token,
    verify_token_for_refresh,
)
from app.utils.client import get_client_ip, get_device_fp, get_user_agent
from app.utils.json_compat import JSJSONResponse
from app.utils.security import (
    hash_password,
    sha256_hex,
    validate_password,
    verify_password,
)

log = logging.getLogger("cwfly.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

# ---------- 响应工具（与 Node res.json / res.status().json 等价） ----------
def ok(data: Any = None, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return JSJSONResponse(body)


def fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


def user_payload(user: dict[str, Any]) -> dict[str, Any]:
    """登录/注册/me/refresh 返回的 user 对象（字段与顺序对齐 Node）。"""
    return {
        "cid": user.get("cid"),
        "username": user.get("username"),
        "rating": user.get("rating") or 0,
        "permissions": user.get("permissions") or "",
        "fsdLevel": user.get("fsdLevel") or 0,
        "createdAt": user.get("createdAt"),
    }


# ============================ 基础检查 ============================
@router.get("/check-admin")
async def check_admin(db: AsyncSession = Depends(get_db)) -> Any:
    try:
        count = await users.count_admins(db)
        return JSJSONResponse({"success": True, "exists": count > 0})
    except Exception:
        return JSJSONResponse({"success": True, "exists": False})


@router.get("/check-cid")
async def check_cid(cid: Optional[str] = None, db: AsyncSession = Depends(get_db)) -> Any:
    if not cid:
        return fail(400, "缺少 CID")
    try:
        user = await users.find_user_public(db, cid)
        return JSJSONResponse({"success": True, "exists": user is not None})
    except Exception:
        return fail(500, "查询失败")


# ============================ 注册 ============================
@router.post(
    "/register",
    dependencies=[Depends(register_limiter), Depends(require_pow_token)],
)
async def register(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    cid = body.get("cid")
    username = body.get("username")
    password = body.get("password")
    email = body.get("email")
    email_code = body.get("emailCode")

    register_fp = get_device_fp(request)
    register_ip = get_client_ip(request)

    # 设备指纹黑名单
    if register_fp and await is_device_banned(register_fp):
        return fail(403, "该设备已被封禁，无法注册新账号", code="DEVICE_BANNED")
    # 同一设备/网络只能注册一次（数据库持久化）
    if register_fp:
        if await users.find_first_by_column(db, "registerFp", register_fp):
            return fail(429, "该设备已注册过账号，请更换设备或联系管理员")
    if register_ip:
        if await users.find_first_by_column(db, "registerIp", register_ip):
            return fail(429, "该设备已注册过账号，请更换设备或联系管理员")

    if not cid or not username or not password or not email or not email_code:
        return fail(400, "请填写完整信息（邮箱及验证码必填）")

    pw_err = validate_password(password)
    if pw_err:
        return fail(400, pw_err)

    if len(str(cid)) != 4 or not str(cid).isdigit():
        return fail(400, "CID 必须为4位数字")
    cid = str(cid)

    if await users.find_user_public(db, cid):
        return fail(409, "该 CID 已被注册")
    if await users.find_user_by_email(db, email):
        return fail(409, "该邮箱已被注册")

    if not await verify_code(email, email_code):
        return fail(400, "邮箱验证码错误或已过期")

    register_user_agent = get_user_agent(request)
    created = await users.create_user(
        db,
        {
            "cid": cid,
            "username": username,
            "password": hash_password(password),
            "rating": 0,
            "permissions": "",
            "fsdLevel": 0,
            "email": email or "",
            "fsdPasswordHash": sha256_hex(password),
            "registerIp": register_ip,
            "registerFp": register_fp,
            "registerUserAgent": register_user_agent,
        },
    )

    # 证据链：注册即写登录日志（失败不阻塞注册）
    try:
        await users.insert_login_log(
            db,
            {
                "userId": cid,
                "ip": register_ip,
                "userAgent": register_user_agent,
                "deviceFp": register_fp,
                "success": True,
                "type": "register",
            },
        )
    except Exception as exc:
        log.error("[auth.py] 注册日志写入失败: %s", exc)

    token = sign_token(created)

    # 欢迎邮件（不阻塞响应）
    if created.get("email"):
        fire_and_forget(
            send_notification(
                created["email"],
                {
                    "subject": "欢迎加入 CW 模拟飞行",
                    "intro": f"欢迎您，{created['username']}！",
                    "body": "您的账号已成功注册。您可以使用 CID 登录平台，开始您的模拟飞行之旅。",
                    "action": "开始体验",
                    "actionUrl": f"{_frontend_url()}/dashboard",
                },
            )
        )

    return ok({"token": token, "user": user_payload(created)})
    # Node 版异常兜底见下方包装器


# ============================ 登录 ============================
@router.post(
    "/login",
    dependencies=[Depends(login_limiter), Depends(require_pow_token)],
)
async def login(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    cid = body.get("cid")
    password = body.get("password") or ""
    ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_fp = get_device_fp(request)

    if device_fp and await is_device_banned(device_fp):
        try:
            await users.insert_login_log(
                db,
                {
                    "userId": cid or "unknown",
                    "ip": ip,
                    "userAgent": user_agent,
                    "deviceFp": device_fp,
                    "success": False,
                    "type": "login",
                    "failReason": "device_banned",
                },
            )
        except Exception:
            pass
        return fail(403, "该设备已被封禁，请联系管理员", code="DEVICE_BANNED")

    lock_msg = await check_login_lock(db, cid)
    if lock_msg:
        return fail(429, lock_msg)

    user = await users.find_user_with_credentials(db, cid)
    if not user:
        await record_login_failure(db, cid, ip)
        await _safe_login_log(db, cid or "unknown", ip, user_agent, device_fp, False, "notfound")
        return fail(401, "CID 或密码错误")

    if not verify_password(password, user.get("password")):
        await record_login_failure(db, cid, ip)
        await _safe_login_log(db, cid, ip, user_agent, device_fp, False, "password")
        return fail(401, "CID 或密码错误")

    await clear_login_failures(db, cid)

    # 同步 FSD 密码哈希（兼容老用户）
    if not user.get("fsdPasswordHash") or len(str(user.get("fsdPasswordHash"))) != 64:
        fsd_hash = sha256_hex(password)
        try:
            await users.update_user(db, cid, {"fsdPasswordHash": fsd_hash})
        except Exception:
            pass

    # 可信 IP 校验：新 IP → 邮箱二次验证
    trusted = await users.trusted_ips(db, user.get("registerIp"), user["cid"])
    if ip not in trusted:
        return JSJSONResponse(
            {
                "success": True,
                "needVerify": True,
                "data": {
                    "email": user.get("email") or "",
                    "message": "检测到新设备/IP 登录，请通过邮箱验证码确认身份",
                },
            }
        )

    await _safe_login_log(db, cid, ip, user_agent, device_fp, True, "")
    token = sign_token(user)
    return ok({"token": token, "user": user_payload(user)})


# ============================ 登录二次验证（新 IP） ============================
@router.post(
    "/login-verify",
    dependencies=[Depends(login_limiter), Depends(require_pow_token)],
)
async def login_verify(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    cid = body.get("cid")
    email_code = body.get("emailCode")
    ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_fp = get_device_fp(request)

    if not cid or not email_code:
        return fail(400, "缺少参数")

    user = await users.find_user_with_credentials(db, str(cid))
    if not user:
        return fail(401, "账号不存在")
    if not user.get("email"):
        return fail(400, "该账号未绑定邮箱，请联系管理员")

    lock_msg = await check_login_lock(db, user["cid"])
    if lock_msg:
        return fail(429, lock_msg)
    if device_fp and await is_device_banned(device_fp):
        return fail(403, "设备已被封禁", code="DEVICE_BANNED")

    if not await verify_code(user["email"], email_code):
        await record_login_failure(db, user["cid"], ip)
        return fail(400, "邮箱验证码错误或已过期")

    await _safe_login_log(db, user["cid"], ip, user_agent, device_fp, True, "")
    token = sign_token(user)
    return ok({"token": token, "user": user_payload(user)})


# ============================ 会话续签 ============================
@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        return fail(401, "请先登录")
    token = header[len("Bearer ") :]
    try:
        decoded = verify_token_for_refresh(token)
        fresh = await users.find_user_public(db, str(decoded.get("cid") or ""))
        if not fresh:
            return fail(401, "账号不存在或已注销")
        return ok({"token": sign_token(fresh), "user": user_payload(fresh)})
    except TokenExpiredError:
        log.error("[auth.py] refresh 失败: token expired")
        return fail(401, "登录已过期，请重新登录")
    except TokenError as exc:
        log.error("[auth.py] refresh 失败: %s", exc)
        return fail(401, "登录无效，请重新登录")


# ============================ 修改密码 ============================
@router.put("/password", dependencies=[Depends(sensitive_limiter)])
async def change_password(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    old_password = body.get("oldPassword") or ""
    new_password = body.get("newPassword") or ""

    user = await users.find_user_public(db, current.cid)
    if not user:
        return fail(404, "用户不存在")

    creds = await users.find_user_with_credentials(db, current.cid)
    if not creds or not verify_password(old_password, creds.get("password")):
        return fail(401, "原密码错误")

    await users.update_user(
        db,
        current.cid,
        {"password": hash_password(new_password), "fsdPasswordHash": sha256_hex(new_password)},
    )

    if user.get("email"):
        fire_and_forget(
            send_security_alert(
                user["email"],
                {
                    "action": "密码修改",
                    "detail": "您的登录密码已被成功修改。",
                    "time": _now_cn_string(),
                    "ip": get_client_ip(request),
                },
            )
        )
    return JSJSONResponse({"success": True, "message": "密码已更新"})


# ============================ 当前用户 ============================
@router.get("/me")
async def me(db: AsyncSession = Depends(get_db), current: CurrentUser = Depends(get_current_user)) -> Any:
    try:
        user = await users.find_user_public(db, current.cid)
        if not user:
            return fail(404, "用户不存在")
        return ok(user_payload(user))
    except Exception:
        return fail(401, "登录已过期")


# ============================ 忘记密码 / 重置密码 ============================
@router.post(
    "/forgot-password",
    dependencies=[Depends(sensitive_limiter), Depends(require_pow_token)],
)
async def forgot_password(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    email = body.get("email")
    if not email:
        return fail(400, "请输入邮箱")

    user = await users.find_user_by_email(db, email)
    if user:
        code = generate_code()
        try:
            await send_verify_code(email, code, "找回密码")
            await store_code(email, code)
        except Exception as exc:
            log.error("[forgot-password] 邮件发送失败: %s", exc)

    return JSJSONResponse({"success": True, "message": "如果该邮箱已注册，验证码已发送到邮箱"})


@router.post(
    "/reset-password",
    dependencies=[Depends(sensitive_limiter), Depends(require_pow_token)],
)
async def reset_password(request: Request, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        body = await request.json()
    except Exception:
        body = {}
    email = body.get("email")
    code = body.get("code")
    password = body.get("password")
    if not email or not code or not password:
        return fail(400, "请填写完整")

    if not await verify_code(email, code):
        return fail(400, "验证码错误或已过期")

    user = await users.find_user_by_email(db, email)
    if not user:
        return fail(400, "验证码错误或已过期")

    pw_err = validate_password(password)
    if pw_err:
        return fail(400, pw_err)

    await users.update_user(
        db,
        user["cid"],
        {"password": hash_password(password), "fsdPasswordHash": sha256_hex(password)},
    )
    return JSJSONResponse({"success": True, "message": "密码已重置"})


# ============================ 内部工具 ============================
async def _safe_login_log(
    db: AsyncSession,
    user_id: str,
    ip: str,
    user_agent: str,
    device_fp: str,
    success: bool,
    fail_reason: str,
) -> None:
    try:
        await users.insert_login_log(
            db,
            {
                "userId": user_id,
                "ip": ip,
                "userAgent": user_agent,
                "deviceFp": device_fp,
                "success": success,
                "type": "login",
                "failReason": fail_reason,
            },
        )
    except Exception:
        pass


def _frontend_url() -> str:
    from app.config import settings

    return settings.FRONTEND_URL or "http://localhost:5173"


def _now_cn_string() -> str:
    """对齐 Node `new Date().toLocaleString('zh-CN')`（月/日不补零）。"""
    from app.services.zh_time_service import zh_now

    return zh_now()


__all__ = ["router", "AuthFailure", "Response"]
