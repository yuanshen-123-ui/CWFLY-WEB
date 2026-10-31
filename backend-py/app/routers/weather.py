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

        cached = ws.cache_get(code)
        if cached is not None:
            return JSJSONResponse(cached)

        metar = ""
        taf = ""
        source: str | None = None
        tried: list[str] = []

        # 主源并发竞速：aviationweather 与 VATSIM 覆盖高度重合，
        # 并发可把「未命中」的最坏延迟从 2×5s 降到 ~5s，且单源故障立即由另一源兜住
        awc_out, vatsim_out = await asyncio.gather(
            ws.from_aviation_weather(code),
            ws.from_vatsim(code),
            return_exceptions=True,
        )
        settled: list[tuple[str, Any]] = [
            ("aviationweather", awc_out),
            ("vatsim", vatsim_out),
        ]
        for name, result in settled:
            if isinstance(result, BaseException):
                log.warning("[Weather] source %s failed for %s: %s", name, code, result)
            elif result and (result.get("metar") or result.get("taf")):
                tried.append(name)

        awc_val: dict[str, str] = {} if isinstance(awc_out, BaseException) or not awc_out else awc_out
        vatsim_val: dict[str, str] = (
            {} if isinstance(vatsim_out, BaseException) or not vatsim_out else vatsim_out
        )
        if awc_val.get("metar"):
            metar = awc_val["metar"]
            source = "aviationweather"
        if not metar and vatsim_val.get("metar"):
            metar = vatsim_val["metar"]
            source = "vatsim"
        if awc_val.get("taf"):
            taf = awc_val["taf"]

        # 可选源（默认全部关闭；开启后才逐个补缺）
        for name, fetcher in ws.OPTIONAL_SOURCES:
            if metar and taf:
                break
            try:
                out = await fetcher(code)
            except Exception as exc:  # noqa: BLE001
                log.warning("[Weather] source %s failed for %s: %s", name, code, exc)
                continue
            if (out or {}).get("metar") or (out or {}).get("taf"):
                tried.append(name)
            if not metar and (out or {}).get("metar"):
                metar = out["metar"]
                source = name
            if not taf and (out or {}).get("taf"):
                taf = out["taf"]

        # 站点库判定：区分「机场不存在」与「机场存在但未发布 METAR」
        station: dict[str, Any] | None
        try:
            station = await ws.get_station(code)
        except Exception:  # noqa: BLE001
            station = None

        if metar:
            hint: str | None = None
        elif station:
            station_name = ws.ZH_NAMES.get(code) or station.get("name")
            hint = (
                f"{station_name}（{station.get('city') or station.get('country')}）"
                "暂无公开 METAR：该机场未在国际 METAR 数据流中发布，可稍后重试或查看航图"
            )
        else:
            hint = f"机场代码 {code} 不在机场库中，请检查 ICAO 是否正确"

        data: dict[str, Any] = {
            "metar": metar or None,
            "taf": taf or None,
            "parsed": ws.parse_metar(metar) if metar else None,
            "tafParsed": ws.parse_taf(taf) if taf else None,
            "station": ws.ZH_NAMES.get(code) or (station.get("name") if station else None) or code,
            "stationExists": bool(station),
            "metarAvailable": bool(metar),
            "tafAvailable": bool(taf),
            "source": source or None,
            "sourcesTried": tried,
            "hint": hint,
        }

        payload = {"success": True, "data": data}
        ws.cache_put(code, payload, ws.TTL_HIT_MS if metar else ws.TTL_MISS_MS)
        return JSJSONResponse(payload)
    except Exception as exc:  # noqa: BLE001
        log.error("[weather.js] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
