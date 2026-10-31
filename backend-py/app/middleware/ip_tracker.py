"""IP 访问追踪中间件（对齐 Node app.use(recordIp)）：每请求记录一次内存聚合。"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.services.ip_tracker import record_ip
from app.utils.client import get_client_ip, get_device_fp


class IpTrackerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        try:
            record_ip(get_client_ip(request), get_device_fp(request))
        except Exception:  # noqa: BLE001
            pass
        return await call_next(request)


__all__ = ["IpTrackerMiddleware"]
