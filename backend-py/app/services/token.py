"""JWT 签发 / 验证 / 续签（逐行移植 Node src/utils/token.js）。

兼容红线：
- 声明字段：cid, username, rating, permissions, fsdLevel, iat, exp
- 算法：HS256，密钥来自时段轮换
- 续签：exp 过期但 ≤ JWT_REFRESH_GRACE_SECONDS 仍接受；>宽限则过期错误
- 滑动续签：剩余 < JWT_REFRESH_BEFORE_SECONDS 时重签并写 X-Renewed-Token（需查库取最新 claims）
"""
from __future__ import annotations

import time
from typing import Any

import jwt as pyjwt

from app.config import settings
from app.services.key_rotation import get_signing_key, get_verifying_keys


class TokenError(Exception):
    expired = False


class TokenExpiredError(TokenError):
    expired = True


def sign_token(user: dict[str, Any]) -> str:
    iat = int(time.time())
    payload = {
        "cid": user.get("cid"),
        "username": user.get("username"),
        "rating": user.get("rating") or 0,
        "permissions": user.get("permissions") or "",
        "fsdLevel": user.get("fsdLevel") or 0,
        "iat": iat,
        "exp": iat + settings.jwt_expires_seconds,
    }
    return pyjwt.encode(payload, get_signing_key(), algorithm="HS256")


def verify_token(token: str) -> dict[str, Any]:
    """密钥环验证（兼容轮换），失败抛 TokenError / TokenExpiredError。"""
    last: Exception | None = None
    for key in get_verifying_keys():
        try:
            return pyjwt.decode(token, key, algorithms=["HS256"])
        except pyjwt.ExpiredSignatureError as exc:
            last = exc
        except pyjwt.InvalidTokenError as exc:
            last = exc
    if isinstance(last, pyjwt.ExpiredSignatureError):
        raise TokenExpiredError("登录已过期") from last
    raise TokenError("Token 无效") from last


def verify_token_for_refresh(token: str) -> dict[str, Any]:
    """续签专用：先验签名（忽略过期），再检查过期宽限。"""
    last: Exception | None = None
    decoded: dict[str, Any] | None = None
    for key in get_verifying_keys():
        try:
            decoded = pyjwt.decode(
                token, key, algorithms=["HS256"], options={"verify_exp": False}
            )
            break
        except pyjwt.InvalidTokenError as exc:
            last = exc
    if decoded is None:
        raise TokenError("Token 无效") from last

    exp = decoded.get("exp")
    now = int(time.time())
    if exp and exp < now and (now - exp) > settings.JWT_REFRESH_GRACE_SECONDS:
        raise TokenExpiredError("Token 已过期")
    return decoded


def should_renew(decoded: dict[str, Any]) -> bool:
    exp = decoded.get("exp")
    if not exp:
        return False
    return (exp - int(time.time())) < settings.JWT_REFRESH_BEFORE_SECONDS


__all__ = [
    "TokenError",
    "TokenExpiredError",
    "sign_token",
    "verify_token",
    "verify_token_for_refresh",
    "should_renew",
]
