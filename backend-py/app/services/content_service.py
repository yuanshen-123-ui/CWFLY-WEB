"""内容域数据访问 + OpenAIP 机场同步。

对应 Node：
- ``src/routes/content.js``（知识库 / 全局搜索 / 机场）
- ``src/services/openaip.js``（fetchAirportByICAO / normalizeAirportData / saveAirportToDB）

表结构以 ``prisma/schema.prisma`` 为准；列名照抄 Prisma 字段名（camelCase 加反引号）。
"""
from __future__ import annotations

import decimal
import json
import logging
from collections.abc import Iterable
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

log = logging.getLogger("cwfly.content")

PUBLISHED = "published"

# ---- Prisma 字段顺序（保证响应 JSON 的键顺序与 Node 一致） ----
KB_COLUMNS = "id, title, content, category, tags, views, status, createdAt, updatedAt"

AIRPORT_COLUMNS = (
    "icao, name, iata, city, country, lat, lon, elevation, timezone, magnetic, "
    "isMilitary, frequencies, runways"
)

EVENT_COLUMNS = (
    "id, title, `date`, `time`, dep, arr, route, publisher, distance, notams, "
    "atcPositions, `desc`, poster, status"
)

FORUM_POST_COLUMNS = (
    "id, boardId, userId, title, content, pinned, locked, views, createdAt, updatedAt"
)


def normalize_row(
    row: Any,
    *,
    bools: Iterable[str] = (),
    floats: Iterable[str] = (),
) -> dict[str, Any]:
    """SQL 行 → dict（保留列顺序），布尔/浮点按 Prisma 的 JSON 类型归一。"""
    data: dict[str, Any] = dict(row._mapping)
    for name in bools:
        if name in data and data[name] is not None:
            data[name] = bool(data[name])
    for name in floats:
        if name in data and isinstance(data[name], decimal.Decimal):
            data[name] = float(data[name])
    return data


# ============================ 知识库 ============================
async def list_knowledge(db: AsyncSession, category: str | None = None) -> list[dict[str, Any]]:
    """GET /content/knowledge（只返回已发布，按 id desc）。"""
    if category:
        sql = (
            f"SELECT {KB_COLUMNS} FROM `KnowledgeBase` "
            "WHERE category = :category AND status = :status ORDER BY id DESC"
        )
        params: dict[str, Any] = {"category": category, "status": PUBLISHED}
    else:
        sql = f"SELECT {KB_COLUMNS} FROM `KnowledgeBase` WHERE status = :status ORDER BY id DESC"
        params = {"status": PUBLISHED}
    rows = (await db.execute(text(sql), params)).all()
    return [normalize_row(r) for r in rows]


async def get_published_knowledge(db: AsyncSession, kb_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(
                f"SELECT {KB_COLUMNS} FROM `KnowledgeBase` "
                "WHERE id = :id AND status = :status LIMIT 1"
            ),
            {"id": kb_id, "status": PUBLISHED},
        )
    ).first()
    return normalize_row(row) if row else None


async def set_knowledge_views(db: AsyncSession, kb_id: int, views: int) -> None:
    await db.execute(
        text("UPDATE `KnowledgeBase` SET views = :views WHERE id = :id"),
        {"views": views, "id": kb_id},
    )
    await db.commit()


# ============================ 全局搜索 ============================
async def search_events(db: AsyncSession, pattern: str, take: int = 10) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(f"SELECT {EVENT_COLUMNS} FROM `Event` WHERE title LIKE :p LIMIT :take"),
            {"p": pattern, "take": take},
        )
    ).all()
    return [normalize_row(r) for r in rows]


async def search_posts(db: AsyncSession, pattern: str, take: int = 10) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(f"SELECT {FORUM_POST_COLUMNS} FROM `ForumPost` WHERE title LIKE :p LIMIT :take"),
            {"p": pattern, "take": take},
        )
    ).all()
    return [
        normalize_row(r, bools=("pinned", "locked")) for r in rows
    ]


async def search_airports(
    db: AsyncSession,
    icao_pattern: str,
    text_pattern: str,
    take: int = 10,
) -> list[dict[str, Any]]:
    """对齐 ``OR: [icao contains q.toUpperCase(), name contains q, city contains q]``。"""
    rows = (
        await db.execute(
            text(
                f"SELECT {AIRPORT_COLUMNS} FROM `Airport` "
                "WHERE icao LIKE :p1 OR name LIKE :p2 OR city LIKE :p3 LIMIT :take"
            ),
            {"p1": icao_pattern, "p2": text_pattern, "p3": text_pattern, "take": take},
        )
    ).all()
    return [normalize_row(r, bools=("isMilitary",), floats=("lat", "lon", "magnetic")) for r in rows]


async def search_knowledge(db: AsyncSession, pattern: str, take: int = 10) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {KB_COLUMNS} FROM `KnowledgeBase` "
                "WHERE title LIKE :p AND status = :status LIMIT :take"
            ),
            {"p": pattern, "status": PUBLISHED, "take": take},
        )
    ).all()
    return [normalize_row(r) for r in rows]


# ============================ 机场 ============================
def _airport_row(row: Any) -> dict[str, Any] | None:
    if not row:
        return None
    return normalize_row(row, bools=("isMilitary",), floats=("lat", "lon", "magnetic"))


async def get_airport(db: AsyncSession, icao: str) -> dict[str, Any] | None:
    """对齐 ``prisma.airport.findUnique({ where: { icao } })``（icao 是主键）。"""
    row = (
        await db.execute(
            text(f"SELECT {AIRPORT_COLUMNS} FROM `Airport` WHERE icao = :icao LIMIT 1"),
            {"icao": icao},
        )
    ).first()
    return _airport_row(row)


async def list_airports(db: AsyncSession, icao: str | None = None) -> list[dict[str, Any]]:
    """GET /content?icao=（icao 存在时精确匹配，否则全量；按 icao asc）。"""
    if icao:
        rows = (
            await db.execute(
                text(
                    f"SELECT {AIRPORT_COLUMNS} FROM `Airport` WHERE icao = :icao ORDER BY icao ASC"
                ),
                {"icao": icao},
            )
        ).all()
    else:
        rows = (
            await db.execute(
                text(f"SELECT {AIRPORT_COLUMNS} FROM `Airport` ORDER BY icao ASC")
            )
        ).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        item = _airport_row(r)
        if item is not None:
            out.append(item)
    return out


# ============================ OpenAIP（src/services/openaip.js） ============================
API_BASE = "https://api.core.openaip.net/api"
API_TIMEOUT = 4.0  # Node: AbortSignal.timeout(4000)

FREQ_TYPE_NAMES: dict[int, str] = {
    0: "Approach", 1: "APRON", 2: "Arrival", 3: "Center", 4: "CTAF",
    5: "Delivery", 6: "Departure", 7: "FIS", 8: "Gliding", 9: "Ground",
    10: "Information", 11: "Multicom", 12: "Unicom", 13: "Radar", 14: "Tower",
    15: "ATIS", 16: "Radio", 17: "Other", 18: "AIRMET", 19: "AWOS",
    20: "Lights", 21: "VOLMET", 22: "AFIS", 23: "ASOS", 24: "AWIS",
    25: "Emergency", 26: "Clearance Delivery", 27: "Remote Com Outlet",
    28: "Ground Com Outlet", 29: "Flight Service Station", 30: "Class C",
    31: "Class B", 32: "VFR Advisory", 33: "TRSA",
}

SURFACE_NAMES: dict[int, str] = {
    0: "Asphalt", 1: "Concrete", 2: "Grass", 3: "Sand", 4: "Water",
    5: "Bituminous", 6: "Brick", 7: "Macadam", 8: "Stone", 9: "Coral",
    10: "Clay", 11: "Laterite", 12: "Gravel", 13: "Earth", 14: "Ice",
    15: "Snow", 16: "Laminate", 17: "Metal", 18: "Landing Mat",
    19: "PSP", 20: "Wood", 21: "Non Bituminous", 22: "Unknown",
}


def _api_key() -> str:
    return (settings.OPENAPI_KEY or "").strip()


def _headers() -> dict[str, str]:
    key = _api_key()
    return {"x-openaip-api-key": key} if key else {}


async def fetch_airport_by_icao(icao: str) -> dict[str, Any] | None:
    """对齐 Node ``fetchAirportByICAO``：4s 超时、任何异常 → None。"""
    if not _api_key():
        return None
    wanted = (icao or "").upper()
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            search_res = await client.get(
                f"{API_BASE}/airports",
                params={
                    "search": wanted,
                    "fields": (
                        "_id,name,icaoCode,iataCode,type,country,position,timezone,elevation"
                    ),
                },
                headers=_headers(),
            )
            if search_res.status_code >= 400:
                return None
            search_data = search_res.json()
            airports: list[Any] = []
            if isinstance(search_data, dict):
                airports = search_data.get("data") or search_data.get("items") or []
            if not isinstance(airports, list):
                airports = []
            match: dict[str, Any] | None = None
            for item in airports:
                if isinstance(item, dict) and str(item.get("icaoCode") or "").upper() == wanted:
                    match = item
                    break
            if not match or not match.get("_id"):
                return None

            detail_res = await client.get(
                f"{API_BASE}/airports/{match['_id']}", headers=_headers()
            )
            if detail_res.status_code >= 400:
                return None
            payload = detail_res.json()
            return payload if isinstance(payload, dict) else None
    except Exception:  # noqa: BLE001 - Node catch → null
        return None


def _num(value: Any, default: float | int = 0) -> float | int:
    """对齐 JS ``x || 0``（None/0/'' → 0）。"""
    if value is None or value == "":
        return default
    try:
        return value if isinstance(value, (int, float)) else float(value)
    except (TypeError, ValueError):
        return default


def _lookup(table: dict[int, str], key: Any) -> str | None:
    """对齐 JS ``TABLE[key]``：对象键会被字符串化，``3`` 与 ``"3"`` 命中同一项。"""
    if isinstance(key, bool):
        return None
    if isinstance(key, int):
        return table.get(key)
    if isinstance(key, float):
        return table.get(int(key)) if key.is_integer() else None
    if isinstance(key, str):
        try:
            return table.get(int(key.strip()))
        except ValueError:
            return None
    return None


def _js_string(value: Any) -> str:
    """对齐模板字符串里的 ``${v}``。"""
    if value is None:
        return "undefined"
    if value is True:
        return "true"
    if value is False:
        return "false"
    return str(value)


def normalize_airport_data(openaip_data: Any) -> dict[str, Any] | None:
    """对齐 Node ``normalizeAirportData``（字段与顺序一致）。"""
    if not openaip_data:
        return None
    d = openaip_data.get("data") or openaip_data
    if not isinstance(d, dict):
        return None

    geometry = d.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    if not isinstance(coords, list):
        coords = []
    elevation = d.get("elevation") or {}

    frequencies: list[dict[str, Any]] = []
    raw_freqs = d.get("frequencies") or []
    if isinstance(raw_freqs, list):
        for f in raw_freqs:
            if not isinstance(f, dict):
                continue
            ftype = f.get("type")
            type_name = _lookup(FREQ_TYPE_NAMES, ftype)
            frequencies.append(
                {
                    "name": f.get("name") or type_name or "",
                    "type": type_name or f"Type-{_js_string(ftype)}",
                    "frequency": f.get("value") or "",
                    "primary": bool(f.get("primary")),
                }
            )

    runways: list[dict[str, Any]] = []
    raw_runways = d.get("runways") or []
    if isinstance(raw_runways, list):
        for r in raw_runways:
            if not isinstance(r, dict):
                continue
            surface = r.get("surface") or {}
            comp_main = surface.get("mainComposite")
            if comp_main is None:  # JS `??`：仅 null/undefined 才回退
                composition = surface.get("composition") or []
                comp_main = (
                    composition[0] if isinstance(composition, list) and composition else None
                )
            dimension = r.get("dimension") or {}
            length = _num((dimension.get("length") or {}).get("value"))
            width = _num((dimension.get("width") or {}).get("value"))
            heading = r.get("trueHeading")
            runways.append(
                {
                    "ident": r.get("designator") or "",
                    "length": length,
                    "width": width,
                    "surface": _lookup(SURFACE_NAMES, comp_main) or "",
                    "heading": heading if heading is not None else None,
                }
            )

    raw_type = d.get("type")
    is_military = isinstance(raw_type, int) and not isinstance(raw_type, bool) and raw_type == 5

    lat = coords[1] if len(coords) > 1 else 0
    lon = coords[0] if coords else 0
    magnetic = d.get("magneticDeclination")
    return {
        "icao": str(d.get("icaoCode") or "").upper(),
        "name": d.get("name") or "",
        "iata": d.get("iataCode") or "",
        "city": "",
        "country": d.get("country") or "",
        "lat": _num(lat),
        "lon": _num(lon),
        "elevation": _num(elevation.get("value")),
        "timezone": "",
        "magnetic": _num(magnetic),
        "isMilitary": is_military,
        "frequencies": frequencies,
        "runways": runways,
    }


def _json_array(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


async def save_airport_to_db(db: AsyncSession, data: dict[str, Any] | None) -> None:
    """对齐 Node ``saveAirportToDB``（prisma.upsert）；失败只告警不抛出。"""
    if not data or not data.get("icao"):
        return
    payload = {
        "icao": data["icao"],
        "name": data.get("name", ""),
        "iata": data.get("iata", ""),
        "city": data.get("city", ""),
        "country": data.get("country", ""),
        "lat": data.get("lat", 0),
        "lon": data.get("lon", 0),
        "elevation": data.get("elevation", 0),
        "timezone": data.get("timezone", ""),
        "magnetic": data.get("magnetic", 0),
        "isMilitary": 1 if data.get("isMilitary") else 0,
        "frequencies": _json_array(data.get("frequencies") or []),
        "runways": _json_array(data.get("runways") or []),
    }
    try:
        await db.execute(
            text(
                "INSERT INTO `Airport` (icao, name, iata, city, country, lat, lon, elevation, "
                "timezone, magnetic, isMilitary, frequencies, runways) VALUES "
                "(:icao, :name, :iata, :city, :country, :lat, :lon, :elevation, :timezone, "
                ":magnetic, :isMilitary, :frequencies, :runways) "
                "ON DUPLICATE KEY UPDATE name = VALUES(name), iata = VALUES(iata), "
                "city = VALUES(city), country = VALUES(country), lat = VALUES(lat), "
                "lon = VALUES(lon), elevation = VALUES(elevation), timezone = VALUES(timezone), "
                "magnetic = VALUES(magnetic), isMilitary = VALUES(isMilitary), "
                "frequencies = VALUES(frequencies), runways = VALUES(runways)"
            ),
            payload,
        )
        await db.commit()
        log.info(
            "[OpenAIP] 已保存机场数据: %s (%d 频率, %d 跑道)",
            data["icao"],
            len(data.get("frequencies") or []),
            len(data.get("runways") or []),
        )
    except Exception as exc:  # noqa: BLE001 - Node: console.warn 后继续
        log.warning("[OpenAIP] 保存机场失败 %s: %s", data["icao"], exc)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass


__all__ = [
    "PUBLISHED",
    "KB_COLUMNS",
    "AIRPORT_COLUMNS",
    "EVENT_COLUMNS",
    "FORUM_POST_COLUMNS",
    "normalize_row",
    "list_knowledge",
    "get_published_knowledge",
    "set_knowledge_views",
    "search_events",
    "search_posts",
    "search_airports",
    "search_knowledge",
    "get_airport",
    "list_airports",
    "fetch_airport_by_icao",
    "normalize_airport_data",
    "save_airport_to_db",
]
