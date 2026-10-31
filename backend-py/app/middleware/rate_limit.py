"""限流（等价 express-rate-limit；P0 用进程内滑动窗口，后续可换 Redis/MySQL store）。

与 Node 完全一致的关键规则（src/routes/security.js / server.js）：
- 全局 /api：每 IP 每分钟 60 次
- 登录 /auth/login、/auth/login-verify：每 IP 15 分钟 5 次
- 注册 /auth/register：每 IP 每小时 2 次
- 敏感接口：每 IP 每小时 5 次
- 追踪像素：每 IP 每分钟 120 次

响应：429 + `{"success": false, "message": "请求过于频繁，请稍后再试"}`
响应头：`RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`（对齐 standardHeaders: true）
"""
from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque

from fastapi import Request, Response
from starlette.responses import JSONResponse

from app.utils.client import get_client_ip

FREQUENT_MESSAGE = "请求过于频繁，请稍后再试"
LOGIN_FREQUENT_MESSAGE = "请求过于频繁"

# key: (scope, ip) -> 时间戳队列（单调时钟）
_buckets: dict[tuple[str, str], Deque[float]] = {}


@dataclass(frozen=True)
class Limit:
    scope: str
    window_seconds: int
    max_requests: int
    message: str = FREQUENT_MESSAGE


def _consume(limit: Limit, ip: str) -> tuple[bool, int, int]:
    """返回 (allowed, remaining, reset_seconds)。"""
    now = time.monotonic()
    key = (limit.scope, ip)
    q = _buckets.setdefault(key, deque())
    cutoff = now - limit.window_seconds
    while q and q[0] <= cutoff:
        q.popleft()
    if len(q) >= limit.max_requests:
        reset = int(math.ceil(q[0] + limit.window_seconds - now)) if q else limit.window_seconds
        return False, 0, max(reset, 1)
    q.append(now)
    return True, max(limit.max_requests - len(q), 0), limit.window_seconds


def rate_limiter(limit: Limit) -> Callable[[Request, Response], Response | None]:
    """返回可用于 `Depends(...)` 的限流依赖。"""

    async def _dep(request: Request, response: Response) -> None:
        ip = get_client_ip(request) or "unknown"
        allowed, remaining, reset = _consume(limit, ip)
        response.headers["RateLimit-Limit"] = str(limit.max_requests)
        response.headers["RateLimit-Remaining"] = str(remaining)
        response.headers["RateLimit-Reset"] = str(reset)
        if not allowed:
            raise RateLimitExceeded(limit.message, limit.max_requests, reset)

    return _dep


class RateLimitExceeded(Exception):
    def __init__(self, message: str, limit: int, reset: int):
        self.message = message
        self.limit = limit
        self.reset = reset
        super().__init__(message)


class RateLimitMiddleware:
    """全局 /api 限流（ASGI 中间件，放到路由之前才生效）。"""

    def __init__(self, app, limit: Limit):  # type: ignore[no-untyped-def]
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send):  # type: ignore[no-untyped-def]
        if scope["type"] != "http" or not scope.get("path", "").startswith("/api"):
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        ip = get_client_ip(request) or "unknown"
        allowed, remaining, reset = _consume(self.limit, ip)
        if not allowed:
            response = JSONResponse(
                {"success": False, "message": self.limit.message},
                status_code=429,
                headers={
                    "RateLimit-Limit": str(self.limit.max_requests),
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset),
                },
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


# ---- 预置规则（数值与 Node 完全一致）----
GLOBAL_API = Limit("global-api", 60, 60)
LOGIN = Limit("auth-login", 15 * 60, 5, LOGIN_FREQUENT_MESSAGE)
REGISTER = Limit("auth-register", 60 * 60, 2)
SENSITIVE = Limit("auth-sensitive", 60 * 60, 5)
PIXEL = Limit("security-pixel", 60, 120, LOGIN_FREQUENT_MESSAGE)
NETWORK_INFO = Limit("security-network", 60, 60, LOGIN_FREQUENT_MESSAGE)

global_api_limiter = rate_limiter(GLOBAL_API)
login_limiter = rate_limiter(LOGIN)
register_limiter = rate_limiter(REGISTER)
sensitive_limiter = rate_limiter(SENSITIVE)

__all__ = [
    "Limit",
    "GLOBAL_API",
    "LOGIN",
    "REGISTER",
    "SENSITIVE",
    "PIXEL",
    "NETWORK_INFO",
    "RateLimitExceeded",
    "RateLimitMiddleware",
    "global_api_limiter",
    "login_limiter",
    "register_limiter",
    "sensitive_limiter",
]
