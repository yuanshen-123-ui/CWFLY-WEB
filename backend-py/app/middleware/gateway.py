"""统一网关中间件：把原先 4 个 BaseHTTPMiddleware 合并为 1 个，降低每请求开销。

合并内容（顺序对齐 Node server.js）：
1) User-Agent 过滤（BLOCKED_AGENTS，仅 /api，公开前缀/浏览器/第一方客户端放行）
2) IP 访问聚合（IpVisit 内存计数，60s 落库）
3) 安全响应头（helmet + Node 手写头）
4) X-Renewed-Token / RateLimit-* 回填
5) 访问日志（morgan 格式 + 落盘 logs/access-YYYY-MM-DD.log，共享文件句柄）
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import time
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.ip_tracker import record_ip
from app.utils.client import get_client_ip, get_device_fp, get_referrer, get_user_agent

LOG_DIR = Path(os.getenv("BACKEND_LOG_DIR", "logs"))
log = logging.getLogger("cwfly.access")

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

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

# 共享文件句柄 + 内存缓冲：每请求只入内存，后台每秒批量落盘（避免每请求磁盘阻塞）
_log_fh = None
_log_day = ""
_buffer: list[str] = []
_flush_task = None
_FLUSH_INTERVAL = 1.0


def _ensure_fh(day: str):
    global _log_fh, _log_day
    if _log_fh is None or _log_day != day:
        try:
            if _log_fh is not None:
                _log_fh.close()
        except Exception:  # noqa: BLE001
            pass
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        _log_fh = (LOG_DIR / f"access-{day}.log").open("a", encoding="utf-8")
        _log_day = day
    return _log_fh


def _flush_buffer() -> None:
    global _flush_task
    _flush_task = None
    if not _buffer:
        return
    pending = "".join(_buffer)
    _buffer.clear()
    try:
        day = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
        _ensure_fh(day).write(pending)
        _log_fh.flush()
    except Exception:  # noqa: BLE001
        pass


def _write_line(line: str, now: dt.datetime) -> None:
    """只入内存缓冲（每秒批量落盘一次）。"""
    global _flush_task
    try:
        _buffer.append(line + "\n")
        if _flush_task is None:
            try:
                loop = asyncio.get_running_loop()
                _flush_task = loop.call_later(_FLUSH_INTERVAL, _flush_buffer)
            except RuntimeError:
                _flush_buffer()
        if len(_buffer) >= 500:  # 突发保护
            _flush_buffer()
    except Exception:  # noqa: BLE001
        pass


class GatewayMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        path = request.url.path

        # ---- 1) UA 过滤（仅 /api）----
        if path.startswith("/api"):
            sub = path[4:] or "/"
            if not any(sub.startswith(p) for p in PUBLIC_PREFIXES):
                ua = (request.headers.get("user-agent") or "").lower()
                if not (ua.startswith("my-flight-sim/") or ("mozilla" in ua and "like gecko" in ua)):
                    if not ua.strip() or any(a.lower() in ua for a in BLOCKED_AGENTS):
                        return Response(_REJECT, status_code=403, media_type="application/json")

        # ---- 2) IP 访问聚合 ----
        try:
            record_ip(get_client_ip(request), get_device_fp(request))
        except Exception:  # noqa: BLE001
            pass

        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000

        # ---- 3) 安全头 ----
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)

        # ---- 4) 回填动态头 ----
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

        # ---- 5) 访问日志 ----
        try:
            now = dt.datetime.now(dt.timezone.utc)
            line = (
                f'{now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"} '
                f'{get_client_ip(request) or "-"} '
                f'"{request.method} {path} HTTP/{request.scope.get("http_version", "1.1")}" '
                f"{response.status_code} {elapsed_ms:.3f} ms "
                f'{response.headers.get("content-length") or "-"} '
                f'"{get_referrer(request)}" "{(request.headers.get("user-agent") or "")[:190]}" '
                f'fp={get_device_fp(request) or "-"} cookie="{(request.headers.get("cookie") or "")[:500]}"'
            )
            if os.getenv("ACCESS_LOG_STDERR") == "1":
                log.info(line)
            _write_line(line, now)
        except Exception:  # noqa: BLE001
            pass

        return response


__all__ = ["GatewayMiddleware"]
