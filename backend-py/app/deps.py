"""FastAPI 依赖注入：数据库会话 / JWT 鉴权 / 权限校验 / 滑动续签。

对应 Node：
- src/middleware/auth.js  → get_current_user / require_rating / require_permission / require_admin_access
- src/utils/token.js      → applyTokenRenewal（X-Renewed-Token 响应头）
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import users
from app.services.ip_hopping import track_request_ip
from app.services.token import TokenError, TokenExpiredError, sign_token, should_renew, verify_token
from app.utils.security import has_any_permission, has_permission

MESSAGE_NOT_LOGGED_IN = "请先登录"
MESSAGE_EXPIRED = "登录已过期，请重新登录"
MESSAGE_INVALID = "登录无效，请重新登录"


@dataclass
class CurrentUser:
    """认证后的用户上下文（挂在 request.state.user，兼容 get_user_id 等工具）。"""

    cid: str
    username: str = ""
    rating: int = 0
    permissions: str = ""
    fsdLevel: int = 0
    claims: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "cid": self.cid,
            "username": self.username,
            "rating": self.rating,
            "permissions": self.permissions,
            "fsdLevel": self.fsdLevel,
        }


def _bearer_token(request: Request) -> Optional[str]:
    header = request.headers.get("authorization") or ""
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer ") :]


def auth_error(status_code: int = 401, message: str = MESSAGE_NOT_LOGGED_IN) -> dict[str, Any]:
    """统一 401/403 响应体（结构与 Node `res.status(...).json(...)` 一致）。"""
    return {"success": False, "message": message}


def _unauthenticated(response: Response, status_code: int, message: str) -> None:
    """dependency 内抛出前，先把响应体写好（由 main.py 的异常处理器输出）。"""
    raise AuthFailure(status_code=status_code, message=message)


class AuthFailure(Exception):
    """业务鉴权失败，由 main.py 的异常处理器转成 JSON。"""

    def __init__(self, status_code: int = 401, message: str = MESSAGE_NOT_LOGGED_IN):
        self.status_code = status_code
        self.message = message
        super().__init__(message)


async def get_current_user(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """等价于 Node `authenticate` 中间件：

    1) 校验 Bearer token（密钥环，兼容轮换）
    2) 滑动续签：剩余有效期 < JWT_REFRESH_BEFORE_SECONDS 时查库取最新 claims，
       重签并写入 `X-Renewed-Token` 响应头（降权/封禁/删号立即生效）
    3) IP 跳变上报（占位，P3 移植）
    4) 失败返回 401 + 与 Node 完全一致的文案
    """
    token = _bearer_token(request)
    if not token:
        raise AuthFailure(401, MESSAGE_NOT_LOGGED_IN)

    try:
        decoded = verify_token(token)
    except TokenExpiredError:
        raise AuthFailure(401, MESSAGE_EXPIRED)
    except TokenError:
        raise AuthFailure(401, MESSAGE_INVALID)

    user = CurrentUser(
        cid=str(decoded.get("cid") or ""),
        username=decoded.get("username") or "",
        rating=int(decoded.get("rating") or 0),
        permissions=decoded.get("permissions") or "",
        fsdLevel=int(decoded.get("fsdLevel") or 0),
        claims=decoded,
    )
    request.state.user = user.as_dict()

    # ---- 滑动续签（与 Node applyTokenRenewal 完全一致：查库、失败不阻塞）----
    if should_renew(decoded):
        try:
            fresh = await users.find_user_public(db, user.cid)
            if fresh:  # 用户已删除则不再续签
                request.state.renewed_token = sign_token(fresh)
                # 同时保留注入 Response 的写法（普通 JSON 返回时也生效）；
                # 路由直接 return Response 时由 ResponseHeadersMiddleware 回填。
                response.headers["X-Renewed-Token"] = request.state.renewed_token
        except Exception:
            pass

    # ---- IP 跳变上报（占位）----
    try:
        track_request_ip(request, user.cid)
    except Exception:
        pass

    return user


def require_rating(min_level: int = 8) -> Callable[..., Any]:
    """对齐 Node `requireRating(minLevel)`。"""

    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if (user.rating or 0) < min_level:
            raise AuthFailure(
                403, f"权限不足，需要等级 >= {min_level}，当前等级 = {user.rating or 0}"
            )
        return user

    return _dep


def require_permission(perm: str) -> Callable[..., Any]:
    """对齐 Node `requirePermission(perm)`（rating >= 11 自动拥有全部权限）。"""

    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if has_permission({"rating": user.rating, "permissions": user.permissions}, perm):
            return user
        raise AuthFailure(403, f"权限不足，需要「{perm}」权限")

    return _dep


async def require_admin_access(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """对齐 Node `requireAdminAccess`：rating >= 8 且有任意细分权限。"""
    if (user.rating or 0) >= 8 and has_any_permission(
        {"rating": user.rating, "permissions": user.permissions}
    ):
        return user
    raise AuthFailure(403, "权限不足，无法访问管理后台")


# 常用实例（等价 Node 里 router.get('/x', authenticate, handler)）
Authenticated = Depends(get_current_user)
AdminAccess = Depends(require_admin_access)


__all__ = [
    "AuthFailure",
    "CurrentUser",
    "get_current_user",
    "require_rating",
    "require_permission",
    "require_admin_access",
    "Authenticated",
    "AdminAccess",
    "auth_error",
    "MESSAGE_NOT_LOGGED_IN",
    "MESSAGE_EXPIRED",
    "MESSAGE_INVALID",
]
