"""IP 封禁中间件（对齐 Node src/services/ipBan.js::ipBanMiddleware）。

优先级：IpBan 封禁 > 白名单 > IpList 网络管理黑名单
- IpBan 命中 → 403 {"success":false,"code":"IP_BANNED","message":"您已被封禁，请联系管理员"}
- 白名单命中 → 放行（可覆盖 IpList）
- IpList 命中 → 403 {"success":false,"code":"INTERNET_BANNED","message":"您当前所处地区不受平台支持，我们将暂停为您提供任何服务"}
"""
from __future__ import annotations

import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.utils.client import get_client_ip

log = logging.getLogger("cwfly.ipban")

REFRESH_INTERVAL = 60.0  # 秒，与 Node REFRESH_INTERVAL 一致
_last_refresh = 0.0


async def preload_bans() -> None:
    """启动预热（对应 Node ensureBansLoaded）。"""
    global _last_refresh
    try:
        from app.services.ip_ban_store import refresh_bans, refresh_ip_list

        await refresh_bans()
        await refresh_ip_list()
        _last_refresh = time.monotonic()
        log.info("[IpBan] 封禁/名单缓存已预热")
    except Exception as exc:  # noqa: BLE001
        log.warning("[IpBan] 预热失败: %s", exc)


class IpBanMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        global _last_refresh
        try:
            from app.services import ip_ban_store

            now = time.monotonic()
            if now - _last_refresh > REFRESH_INTERVAL:
                _last_refresh = now
                await ip_ban_store.refresh_bans()
                await ip_ban_store.refresh_ip_list()

            ip = get_client_ip(request)
            if ip_ban_store.is_ip_banned(ip):
                log.info("[IpBan] 拦截被封禁 IP %s -> %s %s", ip, request.method, request.url.path)
                return Response(
                    json.dumps(
                        {"success": False, "code": "IP_BANNED", "message": "您已被封禁，请联系管理员"},
                        ensure_ascii=False,
                    ),
                    status_code=403,
                    media_type="application/json",
                )
            if ip_ban_store.is_whitelisted(ip):
                return await call_next(request)
            if ip_ban_store.is_ip_list_banned(ip):
                log.info("[IpBan] 拦截网络管理黑名单 IP %s -> %s %s", ip, request.method, request.url.path)
                return Response(
                    json.dumps(
                        {
                            "success": False,
                            "code": "INTERNET_BANNED",
                            "message": "您当前所处地区不受平台支持，我们将暂停为您提供任何服务",
                        },
                        ensure_ascii=False,
                    ),
                    status_code=403,
                    media_type="application/json",
                )
        except Exception:  # 与 Node 一致：中间件异常不阻断请求
            pass
        return await call_next(request)


__all__ = ["IpBanMiddleware", "preload_bans"]
