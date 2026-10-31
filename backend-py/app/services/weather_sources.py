"""天气数据源 + METAR/TAF 报文解析（对齐 Node src/routes/weather.js）。

机场站点库（Node `src/services/airportStations.js`）已有独立移植
`app/services/airport_stations.py`，此处直接复用，避免重复实现（缓存/兜底语义一致）。

多源策略（与 Node 完全一致）：
1. 主源并发竞速：aviationweather.gov 与 metar.vatsim.net（覆盖重合，单源故障由另一源兜住）；
2. 可选源依次补缺（默认全部关闭，需环境变量开启，读 `.env` 与进程环境，语义同 `process.env`）：
   - metar-taf.com  `WEATHER_ENABLE_METAR_TAF=1`
   - CFY 平台      `WEATHER_CFY_API=<base>`
   - checkwx.com   `CHECKWX_API_KEY=<key>`
单源超时 5s（Node `AbortSignal.timeout(5000)`）。
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Any, Callable, Optional

import httpx

from app.services.airport_stations import (  # noqa: F401  （对外再导出）
    FALLBACK,
    get_station,
    list_station_icaos,
    load_stations,
)
from app.services.airport_stations import clear_cache as clear_station_cache

try:  # Node `process.env` 语义（含 .env）；模块缺失时退回进程环境
    from app.services.env_compat import env_raw as _env_raw
except Exception:  # pragma: no cover - 仅在依赖模块缺失时生效

    def _env_raw(name: str) -> Optional[str]:
        return os.environ.get(name)


log = logging.getLogger("cwfly.weather")

AWC = "https://aviationweather.gov/api/data"

# 单源超时（Node: SRC_TIMEOUT = 5000）
SRC_TIMEOUT_MS = 5000
SRC_TIMEOUT_S = SRC_TIMEOUT_MS / 1000

# 缓存：命中 60 秒；未命中（该机场确实无 METAR）5 分钟
TTL_HIT_MS = 60 * 1000
TTL_MISS_MS = 5 * 60 * 1000
CACHE_MAX = 500

# 常见枢纽中文名（优先展示；未命中时用 OurAirports 英文名）
ZH_NAMES: dict[str, str] = {
    "ZBAA": "北京首都", "ZBAD": "北京大兴", "ZSSS": "上海虹桥", "ZSPD": "上海浦东",
    "ZGGG": "广州白云", "ZGSZ": "深圳宝安", "ZBTJ": "天津滨海", "ZPPP": "昆明长水",
    "ZUCK": "重庆江北", "ZSHC": "杭州萧山", "ZSNJ": "南京禄口", "ZHHH": "武汉天河",
    "ZGHA": "长沙黄花", "ZUUU": "成都天府", "ZLXY": "西安咸阳", "ZLLL": "兰州中川",
    "ZSAM": "厦门高崎", "ZSQD": "青岛胶东", "ZJHK": "海口美兰", "ZJSY": "三亚凤凰",
    "ZSSH": "上海虹桥(旧)", "VHHH": "香港赤鱲角", "VMMC": "澳门", "RCTP": "台北桃园",
    "RCSS": "台北松山",
}


def _env(name: str) -> str:
    """等价 `(process.env[name] || '').trim()`。"""
    return (_env_raw(name) or "").strip()


# ============================================================================
# METAR / TAF 解析
# ============================================================================
_WIND_RE = re.compile(r"\b(\d{3}\d{2,3}G?\d{0,2}(?:MPS|KT))\b")


def parse_metar(raw: str | None) -> dict[str, Any]:
    """对齐 Node parseMetar()：返回中文友好的字段对象（无报文返回 {}）。"""
    if not raw:
        return {}
    wind = ""
    vis = ""
    vis_unit = "m"
    temp = ""
    dew = ""
    qnh = ""
    qnh_unit = "hPa"
    time_str = ""

    t = re.search(r"\b(\d{6}Z)\b", raw)
    if t:
        time_str = t.group(1)

    # 风向风速: xxxTT(G?xx)(MPS|KT)
    w = _WIND_RE.search(raw)
    if w:
        d = w.group(1)
        wind = (
            d[:3]
            + "° "
            + re.sub(r"MPS|KT", "", d[3:], count=1)
            + ("kt" if "KT" in d else "m/s")
        )

    # 能见度: CAVOK → ≥10km
    if "CAVOK" in raw:
        vis = "≥10"
        vis_unit = "km"
    else:
        # 英制英里: 10SM / 6SM / 1/2SM / 1 1/2SM
        sm = re.search(r"\b(\d+(?:\s+\d+)?\s*\d?/?\d*)SM\b", raw)
        if sm:
            vis = sm.group(1).strip()
            vis_unit = "SM"
        else:
            # 标准 4 位米制能见度: 9999 / 5000 / 0350
            v = re.search(r"\b(\d{4})\b(?!\s*/)", raw)
            if v:
                val = v.group(1)
                # 排除误匹配到气压 A2992 等
                if val != "CAVOK" and ("A" + val) not in raw:
                    if val == "9999":
                        vis = "≥10"
                        vis_unit = "km"
                    else:
                        vis = val
                        vis_unit = "m"

    # 温度/露点
    td = re.search(r"\b(M?\d{2})/(M?\d{2})\b", raw)
    if td:
        temp = td.group(1).replace("M", "-", 1)
        dew = td.group(2).replace("M", "-", 1)

    # 气压: QHHHH (hPa) 或 AHHHH (inHg)
    q = re.search(r"\b(Q(\d{4}))\b", raw)
    if q:
        qnh = q.group(2)
        qnh_unit = "hPa"
    else:
        a = re.search(r"\bA(\d{4})\b", raw)
        if a:
            qnh = a.group(1)
            qnh_unit = "inHg"

    return {
        "wind": wind,
        "vis": vis,
        "visUnit": vis_unit,
        "temp": temp,
        "dew": dew,
        "qnh": qnh,
        "qnhUnit": qnh_unit,
        "time": time_str,
    }


_TAF_HEADER_RE = re.compile(r"^TAF\s+\w+\s+\d{6}Z\s+\d{4}/\d{4}")
_TAF_WX_RE = re.compile(
    r"\b([+-]?(?:SH|TS|BC|BL|DR|FZ|MI|PR)?"
    r"(?:RA|SN|SG|PL|GR|GS|DZ|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS|TS|SH|NSW))\b"
)
_TAF_CLOUD_RE = re.compile(r"\b((?:FEW|SCT|BKN|OVC|VV)(\d{3})(?:CB|TCU)?)\b")
_VIS4_RE = re.compile(r"\b(\d{4})\b(?!\s*/)")
_SM_RE = re.compile(r"\b(\d+(?:\s+\d+)?\s*\d?/?\d*)SM\b")


def parse_taf(raw: str | None) -> Optional[dict[str, Any]]:
    """对齐 Node parseTaf()：把 TAF 报文拆成逐行预报 + 中文摘要。"""
    if not raw:
        return None
    lines = [s.strip() for s in raw.split("\n")]
    lines = [s for s in lines if s]
    result: dict[str, Any] = {"raw": raw, "lines": [], "summary": ""}
    forecasts: list[dict[str, Any]] = []

    for line in lines:
        # 跳过 TAF 开头行（如 TAF ZSSS 280300Z 2804/2906）
        header = _TAF_HEADER_RE.match(line)
        if header:
            result["header"] = header.group(0)
            continue

        fc: dict[str, Any] = {
            "type": "base",
            "raw": line,
            "wind": "",
            "vis": "",
            "weather": "",
            "cloud": "",
            "prob": "",
        }

        # 概率 PROB30/PROB40
        prob = re.search(r"\b(PROB[34]0)\b", line)
        if prob:
            fc["prob"] = prob.group(1)

        # 预报类型 TEMPO / BECMG / FMHHHH
        tempo = re.search(r"\b(TEMPO)\s+(\d{4}/\d{4})\b", line)
        becmg = re.search(r"\b(BECMG)\s+(\d{4}/\d{4})\b", line)
        fm = re.search(r"\b(FM(\d{6}))\b", line)
        if tempo:
            fc["type"] = "TEMPO"
            fc["period"] = tempo.group(2)
        elif becmg:
            fc["type"] = "BECMG"
            fc["period"] = becmg.group(2)
        elif fm:
            fc["type"] = "FM"
            fc["period"] = fm.group(2)

        # 风向风速
        w = _WIND_RE.search(line)
        if w:
            d = w.group(1)
            fc["wind"] = (
                d[:3]
                + "° "
                + re.sub(r"MPS|KT", "", d[3:], count=1)
                + ("kt" if "KT" in d else "m/s")
            )

        # 能见度: CAVOK / 9999 / 4 位数
        if "CAVOK" in line:
            fc["vis"] = "CAVOK（≥10km）"
        else:
            sm = _SM_RE.search(line)
            if sm:
                fc["vis"] = sm.group(1).strip() + " SM"
            else:
                v = _VIS4_RE.search(line)
                if v:
                    fc["vis"] = "≥10 km" if v.group(1) == "9999" else v.group(1) + " m"

        # 天气现象: -RA, +SN, BR, FG, TSRA 等
        wx = _TAF_WX_RE.findall(line)
        if wx:
            fc["weather"] = " ".join(wx)

        # 云况
        clouds: list[str] = []
        for cm in _TAF_CLOUD_RE.finditer(line):
            height = int(cm.group(2)) * 100
            clouds.append(cm.group(1).replace(cm.group(2), f"{height}ft", 1))
        if clouds:
            fc["cloud"] = " ".join(clouds)
        if "NSC" in line:
            fc["cloud"] = "NSC（无重要云）"
        if "SKC" in line or "CLR" in line:
            fc["cloud"] = "晴天"

        forecasts.append(fc)

    result["lines"] = forecasts
    # 生成摘要
    if forecasts:
        parts: list[str] = []
        for f in forecasts:
            s = ""
            if f["type"] != "base":
                s += "[" + f["type"] + ((" " + f["period"]) if f.get("period") else "") + "]"
            if f.get("prob"):
                s += " " + f["prob"]
            if f.get("wind"):
                s += " 风" + f["wind"]
            if f.get("vis"):
                s += " 能见度" + f["vis"]
            if f.get("weather"):
                s += " 天气" + f["weather"]
            if f.get("cloud"):
                s += " 云" + f["cloud"]
            parts.append(s.strip())
        result["summary"] = "；".join(parts)
    return result


# ============================================================================
# 数据源
# ============================================================================
async def from_aviation_weather(code: str) -> dict[str, str]:
    """源 1: aviationweather.gov（NOAA；全球 METAR，可带 TAF）。"""
    url = f"{AWC}/metar?ids={code}&format=raw&taf=true"
    async with httpx.AsyncClient(timeout=SRC_TIMEOUT_S, follow_redirects=True) as client:
        resp = await client.get(url)
        if not resp.is_success:
            return {}
        text = resp.text.strip()
    if not text:
        return {}
    lines = [s.strip() for s in text.split("\n")]
    lines = [s for s in lines if s]
    taf_re = re.compile(r"^TAF\b")
    metar_line = next((s for s in lines if not taf_re.match(s)), "")
    taf_lines = [s for s in lines if taf_re.match(s)]
    return {"metar": metar_line or "", "taf": "\n".join(taf_lines)}


async def from_vatsim(code: str) -> dict[str, str]:
    """源 2: VATSIM（返回 '<ICAO> DDHHMMZ ...'，无 METAR 前缀，需归一化）。"""
    url = f"https://metar.vatsim.net/metar.php?id={code}"
    async with httpx.AsyncClient(timeout=SRC_TIMEOUT_S, follow_redirects=True) as client:
        resp = await client.get(url)
        if not resp.is_success:
            return {}
        text = resp.text.strip()
    if not text:
        return {}
    line_re = re.compile(rf"^(?:METAR\s+|SPECI\s+)?{re.escape(code)}\s+\d{{6}}Z")
    line = next((s.strip() for s in text.split("\n") if line_re.match(s.strip())), None)
    if not line:
        return {}
    return {"metar": "METAR " + re.sub(r"^(?:METAR|SPECI)\s+", "", line, count=1)}


async def from_cfy(code: str) -> dict[str, str]:
    """可选源: CFY 平台 API（默认关闭；`WEATHER_CFY_API` 为空则跳过）。"""
    base = _env("WEATHER_CFY_API")
    if not base:
        return {}
    taf_base = re.sub(r"metar", "taf", base, count=1, flags=re.I)

    async def _get(url: str) -> Optional[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=SRC_TIMEOUT_S, follow_redirects=True) as client:
                resp = await client.get(url)
                if not resp.is_success:
                    return None
                data = resp.json()
                return data if isinstance(data, dict) else None
        except Exception:  # noqa: BLE001
            return None

    metar_data, taf_data = await asyncio.gather(
        _get(f"{base}?icao={code}"), _get(f"{taf_base}?icao={code}")
    )
    return {
        "metar": (metar_data.get("data") or metar_data.get("metar") or "") if metar_data else "",
        "taf": (taf_data.get("data") or taf_data.get("taf") or "") if taf_data else "",
    }


async def from_checkwx(code: str) -> dict[str, str]:
    """可选源: checkwx.com（需 `CHECKWX_API_KEY`；无 Key 直接跳过）。"""
    key = _env("CHECKWX_API_KEY")
    if not key:
        return {}
    url = f"https://api.checkwx.com/metar/{code}/decoded"
    async with httpx.AsyncClient(timeout=SRC_TIMEOUT_S, follow_redirects=True) as client:
        resp = await client.get(url, headers={"X-API-Key": key})
        if not resp.is_success:
            return {}
        try:
            payload = resp.json()
        except Exception:  # noqa: BLE001
            return {}
    raw = ""
    try:
        items = payload.get("data") or []
        if items and isinstance(items[0], dict):
            raw = items[0].get("raw_report") or ""
    except Exception:  # noqa: BLE001
        raw = ""
    if not raw:
        return {}
    return {"metar": raw if "METAR" in raw else "METAR " + raw}


async def from_metar_taf(code: str) -> dict[str, str]:
    """可选源: metar-taf.com（需 `WEATHER_ENABLE_METAR_TAF=1`；Cloudflare 常 403）。"""
    if _env_raw("WEATHER_ENABLE_METAR_TAF") != "1":
        return {}
    url = f"https://metar-taf.com/metar/{code}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    async with httpx.AsyncClient(timeout=SRC_TIMEOUT_S, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        if not resp.is_success:
            return {}
        html = resp.text
    m = re.search(rf"METAR\s+{re.escape(code)}\s+\d{{6}}Z[^<\n]{{0,200}}", html)
    return {"metar": m.group(0).strip()} if m else {}


# 源链（可选源，按顺序尝试，命中即停）
OPTIONAL_SOURCES: list[tuple[str, Callable[[str], Any]]] = [
    ("metar_taf", from_metar_taf),
    ("cfy", from_cfy),
    ("checkwx", from_checkwx),
]

# 简易内存缓存（同一机场 60s/5min 内不重复外呼）
_cache: dict[str, dict[str, Any]] = {}


def cache_get(code: str) -> Optional[dict[str, Any]]:
    hit = _cache.get(code)
    if hit and (time.time() * 1000 - float(hit["at"])) < float(hit["ttl"]):
        return hit["payload"]
    return None


def cache_put(code: str, payload: dict[str, Any], ttl_ms: int) -> None:
    _cache[code] = {"at": time.time() * 1000, "ttl": ttl_ms, "payload": payload}
    if len(_cache) > CACHE_MAX:
        oldest = min(_cache.items(), key=lambda kv: kv[1]["at"], default=None)
        if oldest:
            _cache.pop(oldest[0], None)


def clear_cache() -> None:
    _cache.clear()


__all__ = [
    "ZH_NAMES",
    "parse_metar",
    "parse_taf",
    "from_aviation_weather",
    "from_vatsim",
    "from_cfy",
    "from_checkwx",
    "from_metar_taf",
    "OPTIONAL_SOURCES",
    "cache_get",
    "cache_put",
    "clear_cache",
    "TTL_HIT_MS",
    "TTL_MISS_MS",
    "SRC_TIMEOUT_MS",
    # 机场站点库（复用 app.services.airport_stations）
    "get_station",
    "list_station_icaos",
    "load_stations",
    "clear_station_cache",
    "FALLBACK",
]
