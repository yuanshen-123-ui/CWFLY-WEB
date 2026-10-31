"""User-Agent 过滤（对齐 Node server.js 的 BLOCKED_AGENTS 逻辑）。

规则（仅 /api 前缀）：
- 公开路径放行：/auth/login /auth/register /auth/check-cid /events /dashboard
  /flightplans/fsd /profile /security/pixel /security/network-info
- 第一方客户端 UA 前缀 my-flight-sim/ 放行
- 真实浏览器（含 mozilla 且含 like gecko）放行
- 命中黑名单或 UA 为空 → 403 {"success":false,"message":"请求被拒绝"}
"""
from __future__ import annotations

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

BLOCKED_AGENTS = (
    "curl", "wget", "python-requests", "python-httpx", "go-http-client",
    "axios", "aiohttp", "scrapy", "java/", "okhttp", "libwww",
    "perl", "ruby", "php", "net/http", "http_client", "httpclient",
    "Apache-HttpClient", "Java", "urllib", "WWW-Mechanize",
)

PUBLIC_PREFIXES = (
    "/auth/login", "/auth/register", "/auth/check-cid", "/events", "/dashboard",
    "/flightplans/fsd", "/profile", "/security/pixel", "/security/network-info",
)

_REJECT = json.dumps({"success": False, "message": "请求被拒绝"}, ensure_ascii=False)


class UserAgentFilterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        path = request.url.path
        if not path.startswith("/api"):
            return await call_next(request)
        sub = path[4:] or "/"
        if any(sub.startswith(prefix) for prefix in PUBLIC_PREFIXES):
            return await call_next(request)
        ua_raw = request.headers.get("user-agent") or ""
        ua = ua_raw.lower()
        if ua.startswith("my-flight-sim/"):
            return await call_next(request)
        if "mozilla" in ua and "like gecko" in ua:
            return await call_next(request)
        if not ua.strip():
            return Response(_REJECT, status_code=403, media_type="application/json")
        for agent in BLOCKED_AGENTS:
            if agent.lower() in ua:
                return Response(_REJECT, status_code=403, media_type="application/json")
        return await call_next(request)


__all__ = ["UserAgentFilterMiddleware", "BLOCKED_AGENTS", "PUBLIC_PREFIXES"]
