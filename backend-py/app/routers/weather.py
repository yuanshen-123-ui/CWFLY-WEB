"""/api/weather 路由（逐接口对齐 Node src/routes/weather.js）。

端点：GET /api/weather?icao=ZBAA
- 缺少/非法 ICAO → 400（中文文案与 Node 一致）
- 命中缓存（60s/5min）直接返回同一 payload
- 主源并发竞速（aviationweather + vatsim），可选源依次补缺
- 站点库判定「机场不存在」与「机场存在但未发布 METAR」两种提示
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from fastapi import APIRouter, Request

from app.services import weather_sources as ws
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.weather")
router = APIRouter(prefix="/weather", tags=["weather"])


def _fail(status_code: int, message: str) -> JSJSONResponse:
    return JSJSONResponse({"success": False, "message": message}, status_code=status_code)


@router.get("")
async def get_weather(request: Request) -> JSJSONResponse:
    try:
        icao = request.query_params.get("icao")
        if not icao:
            return _fail(400, "缺少 ICAO 代码")
        code = str(icao).upper().strip()
        # 安全（2026-10-25 审计 P3-1）：ICAO 白名单，防参数注入外 URL
        if not re.fullmatch(r"[A-Z0-9]{4}", code):
            return _fail(400, "无效 ICAO 代码")

        payload = await ws.fetch_payload(code)
        return JSJSONResponse(payload)
    except Exception as exc:  # noqa: BLE001
        log.error("[weather.js] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
