"""访问日志（对齐 Node 的 morgan 自定义格式 + 落盘 logs/access-YYYY-MM-DD.log）。

格式：
    <ISO时间> <真实IP> "<METHOD> <URL> HTTP/<版本>" <状态码> <耗时>ms <响应长度> "<Referer>" "<UA>" fp=<设备指纹> cookie="<Cookie>"
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import time
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.utils.client import get_client_ip, get_device_fp, get_referrer, get_user_agent

LOG_DIR = Path(os.getenv("BACKEND_LOG_DIR", "logs"))
log = logging.getLogger("cwfly.access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        started = time.perf_counter()
        response: Response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        self._write(request, response, elapsed_ms)
        return response

    # ---- 内部 ----
    @staticmethod
    def _write(request: Request, response: Response, elapsed_ms: float) -> None:
        try:
            now = dt.datetime.now(dt.timezone.utc)
            ua = (request.headers.get("user-agent") or "")[:190]
            cookie = (request.headers.get("cookie") or "")[:500]
            line = (
                f'{now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"} '
                f'{get_client_ip(request) or "-"} '
                f'"{request.method} {request.url.path} HTTP/{request.scope.get("http_version", "1.1")}" '
                f"{response.status_code} {elapsed_ms:.3f} ms "
                f'{response.headers.get("content-length") or "-"} '
                f'"{get_referrer(request)}" "{ua}" fp={get_device_fp(request) or "-"} '
                f'cookie="{cookie}"'
            )
            log.info(line)
            AccessLogMiddleware._file_log(line, now)
        except Exception:
            pass

    @staticmethod
    def _file_log(line: str, now: dt.datetime) -> None:
        try:
            day = now.strftime("%Y-%m-%d")
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            with (LOG_DIR / f"access-{day}.log").open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass


__all__ = ["AccessLogMiddleware"]
