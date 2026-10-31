"""航迹回放数据访问（对齐 Node src/routes/tracks.js 的 ``$queryRawUnsafe`` 查询）。

数据源：``FlightTrack`` 表（fsd-py 每 10s 采样一次机组位置）。
全部为只读查询；SQL 与原 Node 版本逐字对应，仅把 ``?`` 占位符改为绑定参数。
"""
from __future__ import annotations

import decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# 与 Node 完全相同的聚合口径（HAVING COUNT(*) >= 2 过滤掉单点会话）
SESSIONS_SQL = (
    "SELECT callsign, sessionId, COUNT(*) AS points, "
    "MIN(recordedAt) AS startTime, MAX(recordedAt) AS endTime, "
    "TIMESTAMPDIFF(SECOND, MIN(recordedAt), MAX(recordedAt)) AS durationSec, "
    "MAX(altitude) AS maxAltitude, MAX(groundSpeed) AS maxGroundSpeed "
    "FROM FlightTrack "
    "WHERE (:cs = '' OR callsign = :cs) "
    "GROUP BY callsign, sessionId "
    "HAVING COUNT(*) >= 2 "
    "ORDER BY endTime DESC "
    "LIMIT :limit"
)

SESSION_POINTS_SQL = (
    "SELECT lat, lon, altitude, groundSpeed, heading, onGround, recordedAt "
    "FROM FlightTrack WHERE sessionId = :sid ORDER BY recordedAt ASC LIMIT 20000"
)

LATEST_SESSION_SQL = (
    "SELECT sessionId, MAX(recordedAt) AS endTime "
    "FROM FlightTrack WHERE callsign = :cs "
    "GROUP BY sessionId ORDER BY endTime DESC LIMIT 1"
)

SESSION_POINTS_LIMIT = 20000


def _int_or(value: Any, default: int = 0) -> int:
    """对齐 JS ``Number(v) || 0``。"""
    if value is None:
        return default
    if isinstance(value, decimal.Decimal):
        return int(value)
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return n or default


def _num_or_zero(value: Any) -> float:
    """对齐 JS ``Number(v) || 0``（Float 列）。"""
    if value is None:
        return 0.0
    if isinstance(value, decimal.Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _num(value: Any) -> float:
    """对齐 JS ``Number(v)``（null → 0）。"""
    return _num_or_zero(value)


async def list_sessions(db: AsyncSession, callsign: str, limit: int) -> list[dict[str, Any]]:
    """GET /tracks/sessions?callsign=&limit=。"""
    rows = (
        await db.execute(text(SESSIONS_SQL), {"cs": callsign, "limit": limit})
    ).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        m = r._mapping
        out.append(
            {
                "callsign": m["callsign"],
                "sessionId": _int_or(m["sessionId"]),
                "points": _int_or(m["points"]),
                "startTime": m["startTime"],
                "endTime": m["endTime"],
                "durationSec": _int_or(m["durationSec"]),
                "maxAltitude": _int_or(m["maxAltitude"]),
                "maxGroundSpeed": _int_or(m["maxGroundSpeed"]),
            }
        )
    return out


async def list_session_points(db: AsyncSession, session_id: int) -> list[dict[str, Any]]:
    """GET /tracks/session/:id（按时间正序，最多 20000 点）。"""
    rows = (
        await db.execute(text(SESSION_POINTS_SQL), {"sid": session_id})
    ).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        m = r._mapping
        out.append(
            {
                "lat": _num(m["lat"]),
                "lon": _num(m["lon"]),
                "altitude": _int_or(m["altitude"]),
                "groundSpeed": _int_or(m["groundSpeed"]),
                "heading": _int_or(m["heading"]),
                "onGround": bool(_int_or(m["onGround"])),
                "recordedAt": m["recordedAt"],
            }
        )
    return out


async def latest_session_id(db: AsyncSession, callsign: str) -> int | None:
    """GET /tracks/latest/:callsign 用：该呼号最近一个会话的 sessionId。"""
    row = (await db.execute(text(LATEST_SESSION_SQL), {"cs": callsign})).first()
    if not row:
        return None
    return _int_or(row._mapping["sessionId"])


__all__ = [
    "SESSIONS_SQL",
    "SESSION_POINTS_SQL",
    "LATEST_SESSION_SQL",
    "SESSION_POINTS_LIMIT",
    "list_sessions",
    "list_session_points",
    "latest_session_id",
]
