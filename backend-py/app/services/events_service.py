"""/api/events 数据访问 + 动态状态计算（原生 SQL，列名与 Prisma MySQL 表一致）。

对齐 Node `src/routes/events.js`：
- `enrichEvents`        → 报名统计 registrationCount / pilotCount / controllerCount
- `parseEventTime`      → 兼容 `YYYY-MM-DD` / `MM/DD`（自动补当年），无法解析 → Infinity
- `applyDynamicStatus`  → 未来最近一个 = 报名中；其它未来 = 筹备中；已过 = 已结束；按开始时间倒序
- `createNotification`  → 报名成功站内通知（写 `Notification`，失败静默）
"""
from __future__ import annotations

import datetime as dt
import math
import re
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.json_compat import js_iso

STATUS_CANCELLED = "cancelled"
STATUS_REGISTERED = "registered"

# Event 表列（与 schema.prisma model Event 的字段顺序一致）
EVENT_COLS = (
    "id, title, date, time, dep, arr, route, publisher, distance, notams, "
    "atcPositions, `desc`, poster, status"
)

REGISTRATION_COLS = (
    "id, eventId, userId, type, callsign, aircraft, position, frequency, "
    "status, createdAt, updatedAt"
)

_SHORT_DATE_RE = re.compile(r"^(\d{1,2})[/-](\d{1,2})$")
_FULL_DATE_RE = re.compile(
    r"^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?$"
)


def _row(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


# ==================== 动态状态 ====================
def parse_event_time(event: dict[str, Any]) -> float:
    """解析活动开始时间戳（毫秒）；无日期或无法解析返回 math.inf。"""
    raw_date = str(event.get("date") or "").strip()
    raw_time = str(event.get("time") or "").strip()
    if not raw_date:
        return math.inf
    date_str = raw_date
    short = _SHORT_DATE_RE.match(raw_date)
    if short:
        date_str = f"{dt.datetime.now().year}-{short.group(1)}-{short.group(2)}"
    full = f"{date_str}T{raw_time}" if raw_time else f"{date_str}T00:00"
    match = _FULL_DATE_RE.match(full)
    if not match:
        return math.inf
    try:
        micro = int((match.group(7) or "0").ljust(6, "0")[:6])
        moment = dt.datetime(
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
            int(match.group(4)),
            int(match.group(5)),
            int(match.group(6) or 0),
            micro,
        )
        # 无时区 → 按本机时区解释，与 JS `new Date('...T...')` 行为一致
        return moment.timestamp() * 1000.0
    except Exception:  # noqa: BLE001
        return math.inf


def apply_dynamic_status(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """与前端一致的动态状态；返回包含 `_start`（毫秒或 null）的新列表。"""
    now_ms = dt.datetime.now().timestamp() * 1000.0
    items: list[dict[str, Any]] = []
    for event in events:
        row = dict(event)
        row["_start"] = parse_event_time(event)
        items.append(row)

    future = [r for r in items if r["_start"] != math.inf and r["_start"] > now_ms]
    future.sort(key=lambda r: r["_start"])
    past = [r for r in items if r["_start"] != math.inf and r["_start"] <= now_ms]
    for index, row in enumerate(future):
        row["status"] = "报名中" if index == 0 else "筹备中"
    for row in past:
        row["status"] = "已结束"

    # 按开始时间倒序（最近的在前；无日期的排最后）
    items.sort(
        key=lambda r: (1, 0.0) if r["_start"] == math.inf else (0, -r["_start"])
    )
    for row in items:
        if row["_start"] == math.inf:
            row["_start"] = None  # JSON.stringify(Infinity) → null
        else:
            row["_start"] = int(row["_start"])  # JS 数字无小数点
    return items


# ==================== Event CRUD ====================
async def list_events(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(text(f"SELECT {EVENT_COLS} FROM `Event` ORDER BY id DESC"))
    ).all()
    return [_row(r) for r in rows]


async def list_all_events_unordered(db: AsyncSession) -> list[dict[str, Any]]:
    """Node `prisma.event.findMany()`（无 orderBy）。"""
    rows = (await db.execute(text(f"SELECT {EVENT_COLS} FROM `Event`"))).all()
    return [_row(r) for r in rows]


async def get_event(db: AsyncSession, event_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {EVENT_COLS} FROM `Event` WHERE id = :id LIMIT 1"), {"id": event_id}
        )
    ).first()
    return _row(row) if row else None


async def create_event(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "title": data.get("title") or "",
        "date": data.get("date") or "",
        "time": data.get("time") or "",
        "dep": data.get("dep") or "",
        "arr": data.get("arr") or "",
        "route": data.get("route") or "",
        "publisher": data.get("publisher") or "",
        "distance": data.get("distance") or "",
        "notams": data.get("notams") or "",
        "atcPositions": data.get("atcPositions") or "",
        "desc": data.get("desc") or "",
        "poster": data.get("poster") or "",
        "status": data.get("status") or "报名中",
    }
    result = await db.execute(
        text(
            "INSERT INTO `Event` (title, date, time, dep, arr, route, publisher, distance, "
            "notams, atcPositions, `desc`, poster, status) VALUES "
            "(:title, :date, :time, :dep, :arr, :route, :publisher, :distance, "
            ":notams, :atcPositions, :desc, :poster, :status)"
        ),
        payload,
    )
    await db.commit()
    event_id = int(result.lastrowid)
    created = await get_event(db, event_id)
    return created or {"id": event_id, **payload}


async def update_event(
    db: AsyncSession, event_id: int, values: dict[str, Any]
) -> dict[str, Any] | None:
    allowed = {
        "title": "title",
        "date": "date",
        "time": "time",
        "dep": "dep",
        "arr": "arr",
        "route": "route",
        "distance": "distance",
        "notams": "notams",
        "desc": "`desc`",
        "poster": "poster",
        "atcPositions": "atcPositions",
        "publisher": "publisher",
        "status": "status",
    }
    sets, params = [], {"id": event_id}
    for key, column in allowed.items():
        if key in values:
            sets.append(f"{column} = :{key}")
            params[key] = values[key]
    if not sets:
        return await get_event(db, event_id)
    await db.execute(text(f"UPDATE `Event` SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return await get_event(db, event_id)


async def delete_event(db: AsyncSession, event_id: int) -> None:
    await db.execute(text("DELETE FROM `Event` WHERE id = :id"), {"id": event_id})
    await db.commit()


# ==================== 报名统计 ====================
async def registration_counts(db: AsyncSession) -> dict[int, dict[str, int]]:
    """一次查询拿到全部活动的报名统计（等价 Node 的逐活动 3 次 count）。"""
    rows = (
        await db.execute(
            text(
                "SELECT eventId, COUNT(*) AS total, "
                "SUM(CASE WHEN type = 'pilot' THEN 1 ELSE 0 END) AS pilotCount, "
                "SUM(CASE WHEN type = 'controller' THEN 1 ELSE 0 END) AS controllerCount "
                "FROM `EventRegistration` WHERE status <> :cancelled GROUP BY eventId"
            ),
            {"cancelled": STATUS_CANCELLED},
        )
    ).all()
    out: dict[int, dict[str, int]] = {}
    for row in rows:
        m = row._mapping
        out[int(m["eventId"])] = {
            "registrationCount": int(m["total"] or 0),
            "pilotCount": int(m["pilotCount"] or 0),
            "controllerCount": int(m["controllerCount"] or 0),
        }
    return out


def enrich_events(
    events: list[dict[str, Any]], counts: dict[int, dict[str, int]]
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for event in events:
        stat = counts.get(
            int(event.get("id") or 0), {"registrationCount": 0, "pilotCount": 0, "controllerCount": 0}
        )
        out.append({**event, **stat})
    return out


# ==================== 报名记录 ====================
async def list_user_registrations(
    db: AsyncSession, user_id: str, only_active: bool = False
) -> list[dict[str, Any]]:
    if only_active:
        rows = (
            await db.execute(
                text(
                    f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` "
                    "WHERE userId = :uid AND status <> :cancelled ORDER BY id DESC"
                ),
                {"uid": user_id, "cancelled": STATUS_CANCELLED},
            )
        ).all()
    else:
        rows = (
            await db.execute(
                text(
                    f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` "
                    "WHERE userId = :uid ORDER BY id DESC"
                ),
                {"uid": user_id},
            )
        ).all()
    return [_row(r) for r in rows]


async def get_registration(db: AsyncSession, reg_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` WHERE id = :id LIMIT 1"),
            {"id": reg_id},
        )
    ).first()
    return _row(row) if row else None


async def set_registration_status(db: AsyncSession, reg_id: int, status: str) -> None:
    await db.execute(
        text("UPDATE `EventRegistration` SET status = :status WHERE id = :id"),
        {"status": status, "id": reg_id},
    )
    await db.commit()


async def find_active_registration(
    db: AsyncSession, event_id: int, user_id: str, reg_type: str
) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(
                f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` "
                "WHERE eventId = :eid AND userId = :uid AND type = :type AND status <> :cancelled "
                "LIMIT 1"
            ),
            {"eid": event_id, "uid": user_id, "type": reg_type, "cancelled": STATUS_CANCELLED},
        )
    ).first()
    return _row(row) if row else None


async def find_taken_position(
    db: AsyncSession, event_id: int, position: str
) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(
                f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` "
                "WHERE eventId = :eid AND type = 'controller' AND position = :pos "
                "AND status <> :cancelled LIMIT 1"
            ),
            {"eid": event_id, "pos": position, "cancelled": STATUS_CANCELLED},
        )
    ).first()
    return _row(row) if row else None


async def create_registration(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    # Node: createdAt/updatedAt = new Date().toISOString()（字符串列）
    now_iso = js_iso(dt.datetime.now(dt.timezone.utc))
    payload = {
        "eventId": data["eventId"],
        "userId": data["userId"],
        "type": data.get("type") or "pilot",
        "callsign": data.get("callsign") or "",
        "aircraft": data.get("aircraft") or "",
        "position": data.get("position") or "",
        "frequency": data.get("frequency") or "",
        "status": data.get("status") or STATUS_REGISTERED,
        "createdAt": data.get("createdAt") or now_iso,
        "updatedAt": data.get("updatedAt") or now_iso,
    }
    result = await db.execute(
        text(
            "INSERT INTO `EventRegistration` (eventId, userId, type, callsign, aircraft, "
            "position, frequency, status, createdAt, updatedAt) VALUES "
            "(:eventId, :userId, :type, :callsign, :aircraft, :position, :frequency, "
            ":status, :createdAt, :updatedAt)"
        ),
        payload,
    )
    await db.commit()
    reg_id = int(result.lastrowid)
    created = await get_registration(db, reg_id)
    return created or {"id": reg_id, **payload}


async def cancel_registrations(
    db: AsyncSession, event_id: int, user_id: str, status: str = STATUS_REGISTERED
) -> int:
    result = await db.execute(
        text(
            "UPDATE `EventRegistration` SET status = :cancelled "
            "WHERE eventId = :eid AND userId = :uid AND status = :status"
        ),
        {"cancelled": STATUS_CANCELLED, "eid": event_id, "uid": user_id, "status": status},
    )
    await db.commit()
    return int(result.rowcount or 0)


async def delete_event_registrations(db: AsyncSession, event_id: int) -> None:
    await db.execute(
        text("DELETE FROM `EventRegistration` WHERE eventId = :eid"), {"eid": event_id}
    )
    await db.commit()


async def list_event_registrations(
    db: AsyncSession, event_id: int, reg_type: str
) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {REGISTRATION_COLS} FROM `EventRegistration` "
                "WHERE eventId = :eid AND type = :type AND status <> :cancelled "
                "ORDER BY createdAt ASC"
            ),
            {"eid": event_id, "type": reg_type, "cancelled": STATUS_CANCELLED},
        )
    ).all()
    return [_row(r) for r in rows]


async def users_by_cids(
    db: AsyncSession, cids: list[str]
) -> dict[str, dict[str, Any]]:
    if not cids:
        return {}
    params: dict[str, Any] = {}
    placeholders = []
    for index, cid in enumerate(cids):
        key = f"cid{index}"
        placeholders.append(f":{key}")
        params[key] = cid
    rows = (
        await db.execute(
            text(
                "SELECT cid, username, rating, fsdLevel FROM `User` "
                f"WHERE cid IN ({', '.join(placeholders)})"
            ),
            params,
        )
    ).all()
    return {str(r._mapping["cid"]): _row(r) for r in rows}


# ==================== 站内通知（Node createNotification） ====================
async def create_notification(
    db: AsyncSession,
    user_id: str,
    notif_type: str,
    title: str,
    content: str = "",
    link: str = "",
) -> None:
    """写 Notification；失败静默（Node `try { ... } catch {}`）。"""
    try:
        await db.execute(
            text(
                "INSERT INTO `Notification` (userId, type, title, content, link, createdAt) "
                "VALUES (:uid, :type, :title, :content, :link, :now)"
            ),
            {
                "uid": user_id,
                "type": notif_type,
                "title": title,
                "content": content,
                "link": link,
                "now": dt.datetime.utcnow(),
            },
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass


__all__ = [
    "EVENT_COLS",
    "REGISTRATION_COLS",
    "STATUS_CANCELLED",
    "STATUS_REGISTERED",
    "parse_event_time",
    "apply_dynamic_status",
    "list_events",
    "list_all_events_unordered",
    "get_event",
    "create_event",
    "update_event",
    "delete_event",
    "registration_counts",
    "enrich_events",
    "list_user_registrations",
    "get_registration",
    "set_registration_status",
    "find_active_registration",
    "find_taken_position",
    "create_registration",
    "cancel_registrations",
    "delete_event_registrations",
    "list_event_registrations",
    "users_by_cids",
    "create_notification",
]
