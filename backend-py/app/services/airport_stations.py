"""机场站点库（移植 Node `src/services/airportStations.js`）。

数据源：OurAirports `airports.csv`（Public Domain）。
用途：判断 ICAO 是否真实存在、提供机场名称/城市、作为 METAR 站点清单来源。
缓存：`data/airports_cn.json`，TTL 7 天；下载失败沿用旧缓存；最后兜底内置枢纽表。

与 Node 的差异：
- 下载用 `httpx.AsyncClient`（Node 用全局 `fetch` + AbortSignal.timeout(90s)），超时同为 90s；
- 文件读写用 `asyncio.to_thread`（Node 同步 fs），避免阻塞事件循环；
- 并发去重语义一致（同一时刻只有一次加载，其余等待同一 Future）。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.services.env_compat import PROJECT_ROOT
from app.utils.json_compat import js_iso

log = logging.getLogger("cwfly.airport_stations")

CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
CACHE_DIR = PROJECT_ROOT / "data"
CACHE_FILE = CACHE_DIR / "airports_cn.json"
TTL_MS = 7 * 24 * 3600 * 1000  # 7 天
MAX_CSV_BYTES = 40 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 90.0

COUNTRIES = {"CN", "HK", "MO", "TW"}
TYPES = {"large_airport", "medium_airport", "small_airport"}

_stations: Optional[Dict[str, Dict[str, str]]] = None
_loading: Optional["asyncio.Future[Dict[str, Dict[str, str]]]"] = None

_ICAO4_RE = re.compile(r"^[A-Z]{4}$")


# ------------------------------------------------------------------ CSV 解析
def parse_csv(text: str) -> List[List[str]]:
    """最小 CSV 解析（OurAirports 字段含引号与逗号），逐字符与 Node 实现一致。"""
    rows: List[List[str]] = []
    row: List[str] = []
    field: List[str] = []
    in_quotes = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if in_quotes:
            if ch == '"':
                if i + 1 < n and text[i + 1] == '"':
                    field.append('"')
                    i += 1
                else:
                    in_quotes = False
            else:
                field.append(ch)
        elif ch == '"':
            in_quotes = True
        elif ch == ",":
            row.append("".join(field))
            field = []
        elif ch == "\n":
            row.append("".join(field))
            rows.append(row)
            row = []
            field = []
        elif ch != "\r":
            field.append(ch)
        i += 1
    if field or row:
        row.append("".join(field))
        rows.append(row)
    return rows


def build_stations(text: str) -> Dict[str, Dict[str, str]]:
    """CSV 文本 → {ICAO: {name, city, type, country}}（只保留 CN/HK/MO/TW 的机场）。"""
    rows = parse_csv(text)
    if not rows:
        raise ValueError("CSV 为空")
    header = rows[0]
    idx: Dict[str, int] = {name: i for i, name in enumerate(header)}
    for key in ("ident", "type", "name", "iso_country", "icao_code", "gps_code", "local_code", "municipality"):
        if key not in idx:
            raise ValueError(f"CSV 缺少列: {key}")

    out: Dict[str, Dict[str, str]] = {}
    for r in range(1, len(rows)):
        row = rows[r]
        if not row or len(row) < len(header):
            continue
        country = row[idx["iso_country"]]
        if country not in COUNTRIES:
            continue
        type_ = row[idx["type"]]
        if type_ not in TYPES:
            continue
        # 4 字码可能落在 ident / icao_code / gps_code / local_code 任一列
        icao = ""
        for key in ("icao_code", "ident", "gps_code", "local_code"):
            value = (row[idx[key]] or "").strip().upper()
            if _ICAO4_RE.match(value):
                icao = value
                break
        if not icao:
            continue
        out[icao] = {
            "name": (row[idx["name"]] or "").strip(),
            "city": (row[idx["municipality"]] or "").strip(),
            "type": type_,
            "country": country,
        }
    return out


# ------------------------------------------------------------------ 缓存读写
def _read_cache_sync() -> Optional[Dict[str, Any]]:
    try:
        stat = CACHE_FILE.stat()
        with open(CACHE_FILE, "r", encoding="utf-8", errors="replace") as fh:
            raw = json.load(fh)
        if not raw or not raw.get("stations"):
            return None
        fresh = (dt.datetime.now().timestamp() * 1000 - stat.st_mtime * 1000) < TTL_MS
        return {"stations": raw["stations"], "fresh": fresh, "generatedAt": raw.get("generatedAt")}
    except Exception:
        return None


def _write_cache_sync(stations: Dict[str, Dict[str, str]]) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {
                "generatedAt": js_iso(dt.datetime.now(dt.timezone.utc)),
                "source": CSV_URL,
                "count": len(stations),
                "stations": stations,
            },
            ensure_ascii=False,
        )
        tmp = Path(str(CACHE_FILE) + ".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(payload)
        tmp.replace(CACHE_FILE)  # 原子替换，避免半截文件
    except Exception as exc:
        log.warning("[airportStations] 写入缓存失败: %s", exc)


async def _download() -> str:
    import httpx

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True) as client:
        resp = await client.get(CSV_URL)
    if resp.status_code < 200 or resp.status_code >= 300:
        raise RuntimeError(f"HTTP {resp.status_code}")
    content = resp.content
    if len(content) > MAX_CSV_BYTES:
        raise RuntimeError("CSV 超过大小上限")
    return content.decode("utf-8", "replace")


# ------------------------------------------------------------------ 对外接口
async def load_stations() -> Dict[str, Dict[str, str]]:
    """加载站点表（内存 → 磁盘缓存 → 下载）；永不抛错（与 Node 一致）。"""
    global _stations, _loading
    if _stations is not None:
        return _stations
    if _loading is not None:
        return await _loading

    loop = asyncio.get_running_loop()
    future: "asyncio.Future[Dict[str, Dict[str, str]]]" = loop.create_future()
    _loading = future

    async def _load() -> Dict[str, Dict[str, str]]:
        cached = await asyncio.to_thread(_read_cache_sync)
        if cached and cached.get("fresh"):
            return cached["stations"]
        try:
            text = await _download()
            stations = build_stations(text)
            if len(stations) < 50:
                raise RuntimeError("解析到的站点过少")
            await asyncio.to_thread(_write_cache_sync, stations)
            log.info("[airportStations] OurAirports 站点库已更新: %s 个（CN/HK/MO/TW）", len(stations))
            return stations
        except Exception as exc:
            log.warning("[airportStations] 更新失败，使用缓存/兜底: %s", exc)
            if cached and cached.get("stations"):
                await asyncio.to_thread(_write_cache_sync, cached["stations"])
                return cached["stations"]
            return dict(FALLBACK)

    try:
        stations = await _load()
    except Exception:  # 极端情况：连兜底都失败
        stations = dict(FALLBACK)
    _stations = stations
    _loading = None
    if not future.done():
        future.set_result(stations)
    return stations


async def get_station(icao: str) -> Optional[Dict[str, str]]:
    """查询单个机场；不存在/非法 4 字码返回 None。"""
    code = str(icao or "").strip().upper()
    if not _ICAO4_RE.match(code):
        return None
    stations = await load_stations()
    station = stations.get(code)
    if not station:
        return None
    out: Dict[str, str] = {"icao": code}
    out.update(station)
    return out


async def list_station_icaos(types: Iterable[str] = ("large_airport", "medium_airport")) -> List[str]:
    """按类型筛选的 4 字码清单（供 METAR 下载清单使用），结果升序。"""
    stations = await load_stations()
    want = set(types)
    return sorted(code for code, station in stations.items() if station.get("type") in want)


# 内置兜底（网络不可用且无缓存时，只保证主要枢纽可判存在）
FALLBACK: Dict[str, Dict[str, str]] = {
    "ZBAA": {"name": "Beijing Capital International Airport", "city": "Beijing", "type": "large_airport", "country": "CN"},
    "ZBAD": {"name": "Beijing Daxing International Airport", "city": "Beijing", "type": "large_airport", "country": "CN"},
    "ZSPD": {"name": "Shanghai Pudong International Airport", "city": "Shanghai", "type": "large_airport", "country": "CN"},
    "ZSSS": {"name": "Shanghai Hongqiao International Airport", "city": "Shanghai", "type": "large_airport", "country": "CN"},
    "ZGGG": {"name": "Guangzhou Baiyun International Airport", "city": "Guangzhou", "type": "large_airport", "country": "CN"},
    "ZUUU": {"name": "Chengdu Shuangliu International Airport", "city": "Chengdu", "type": "large_airport", "country": "CN"},
    "ZPPP": {"name": "Kunming Changshui International Airport", "city": "Kunming", "type": "large_airport", "country": "CN"},
    "ZLXY": {"name": "Xi'an Xianyang International Airport", "city": "Xi'an", "type": "large_airport", "country": "CN"},
    "ZHHH": {"name": "Wuhan Tianhe International Airport", "city": "Wuhan", "type": "large_airport", "country": "CN"},
    "ZSHC": {"name": "Hangzhou Xiaoshan International Airport", "city": "Hangzhou", "type": "large_airport", "country": "CN"},
    "ZSNJ": {"name": "Nanjing Lukou International Airport", "city": "Nanjing", "type": "large_airport", "country": "CN"},
    "VHHH": {"name": "Hong Kong International Airport", "city": "Hong Kong", "type": "large_airport", "country": "HK"},
}


def clear_cache() -> None:
    """测试/运维用：清空内存缓存。"""
    global _stations
    _stations = None


__all__ = [
    "CSV_URL",
    "CACHE_FILE",
    "TTL_MS",
    "FALLBACK",
    "parse_csv",
    "build_stations",
    "load_stations",
    "get_station",
    "list_station_icaos",
    "clear_cache",
]
