"""IP 封禁中间件（P0：放行；P3 移植 Node src/middleware/ipBan.js + IpBan 表热加载）。

Node 版规则：被封禁 IP 的所有请求直接 403 `{"success": false, "message": "请求被拒绝"}`，
并在启动时预热封禁列表（ensureBansLoaded）。P0 灰度先写占位实现，避免误封影响对比。
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.utils.client import get_client_ip


class IpBanMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        # P3: 命中封禁列表 → 403 {"success": False, "message": "请求被拒绝"}
        _ = get_client_ip(request)  # 保证与 Node 相同的 IP 解析口径
        return await call_next(request)


__all__ = ["IpBanMiddleware"]
