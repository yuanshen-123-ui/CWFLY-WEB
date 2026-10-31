"""安全响应头（对齐 Node server.js 里的 header 中间件 + helmet 配置）。"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """逐项复刻 Node 版设置的头（CSP 由 nginx 统一设置，这里只覆盖 API 响应）。"""

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response: Response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


__all__ = ["SecurityHeadersMiddleware"]
