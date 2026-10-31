"""Lead 修复：X-Renewed-Token / RateLimit-* 头在「路由直接返回 Response」时被丢弃的问题。

做法：
- deps.get_current_user 把续签 token 写入 request.state.renewed_token；
- rate_limiter 依赖把限流头写入 request.state.rate_limit_headers；
- 本中间件在响应返回前统一回填到响应头（对任何 return 类型都生效）。
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class ResponseHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        try:
            renewed = getattr(request.state, "renewed_token", None)
            if renewed:
                response.headers["X-Renewed-Token"] = renewed
            headers = getattr(request.state, "rate_limit_headers", None)
            if headers:
                for key, value in headers.items():
                    response.headers.setdefault(key, value)
        except Exception:  # noqa: BLE001
            pass
        return response


__all__ = ["ResponseHeadersMiddleware"]
