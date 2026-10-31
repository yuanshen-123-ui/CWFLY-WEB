"""飞行计划数据访问 + 字段校验（原生 SQL，列名与 Prisma MySQL 表一致）。"""
from __future__ import annotations

import datetime as dt
import re
import secrets
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ===== 字段格式校验（与 Node FP_PATTERNS 逐条一致；不匹配则清空）=====
FP_PATTERNS: dict[str, re.Pattern[str]] = {
    "callsign": re.compile(r"^[A-Za-z0-9]{1,7}$"),
    "flightType": re.compile(r"^(IFR|VFR)$", re.I),
    "aircraft": re.compile(r"^[A-Za-z0-9]{1,5}$"),
    "transponder": re.compile(r"^[A-Za-z0-9]+$"),
    "wakeCategory": re.compile(r"^(L|M|H|J)$", re.I),
    "cruiseAlt": re.compile(r"^\d{1,5}$"),
    "depIcao": re.compile(r"^[A-Za-z]{1,4}$", re.I),
    "arrIcao": re.compile(r"^[A-Za-z]{1,4}$", re.I),
    "alternate": re.compile(r"^[A-Za-z]{1,4}$", re.I),
    "depTime": re.compile(r"^\d{4}$"),
    "flightTime": re.compile(r"^\d{4}$"),
    "cruiseSpeed": re.compile(r"^\d{3}$"),
    "endurance": re.compile(r"^\d{4}$"),
    "equipment": re.compile(r"^[A-Za-z0-9]+$"),
    "route": re.compile(r"^[A-Za-z0-9\s]+$"),
    "remarks": re.compile(r"^[A-Za-z0-9\s]+$"),
}

SHARE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_COLUMNS = (
    "id, userId, callsign, flightType, aircraft, wakeCategory, equipment, transponder, "
    "depIcao, depTime, cruiseAlt, cruiseSpeed, arrIcao, alternate, flightTime, endurance, "
    "route, remarks, status, filedAt, shareId, syncFsd"
)

_SHARE_COLUMNS = (
    "id, callsign, flightType, aircraft, wakeCategory, equipment, transponder, depIcao, depTime, "
    "cruiseAlt, cruiseSpeed, arrIcao, alternate, flightTime, endurance, route, remarks, shareId, filedAt"
)


def clean_field(value: Any, pattern: re.Pattern[str] | None) -> str:
    """对齐 Node clean()：转字符串 trim；不匹配正则则清空。"""
    s = "" if value is None else str(value).strip()
    if pattern is not None and s and not pattern.search(s):
        return ""
    return s


def generate_share_id() -> str:
    """8 位分享 ID（crypto 随机，排除易混淆字符）。"""
    return "".join(secrets.choice(SHARE_CHARS) for _ in range(8))


def zh_now_string() -> str:
    """对齐 Node `new Date().toLocaleString('zh-CN', { hour12: false })`。"""
    return dt.datetime.now().strftime("%Y/%m/%d %H:%M:%S")


def normalize_row(row: Any) -> dict[str, Any]:
    data = dict(row._mapping)
    if "syncFsd" in data:
        data["syncFsd"] = bool(data["syncFsd"])
    return data


async def list_plans(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(f"SELECT {_COLUMNS} FROM `FlightPlan` WHERE userId = :uid ORDER BY id DESC"),
            {"uid": user_id},
        )
    ).all()
    return [normalize_row(r) for r in rows]


async def get_plan(db: AsyncSession, plan_id: int, user_id: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_COLUMNS} FROM `FlightPlan` WHERE id = :id AND userId = :uid LIMIT 1"),
            {"id": plan_id, "uid": user_id},
        )
    ).first()
    return normalize_row(row) if row else None


async def get_plan_by_id(db: AsyncSession, plan_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_COLUMNS} FROM `FlightPlan` WHERE id = :id LIMIT 1"), {"id": plan_id}
        )
    ).first()
    return normalize_row(row) if row else None


async def get_plan_by_share(db: AsyncSession, share_id: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_SHARE_COLUMNS} FROM `FlightPlan` WHERE shareId = :sid LIMIT 1"),
            {"sid": share_id},
        )
    ).first()
    return normalize_row(row) if row else None


async def get_latest_plan(db: AsyncSession, user_id: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_COLUMNS} FROM `FlightPlan` WHERE userId = :uid ORDER BY id DESC LIMIT 1"),
            {"uid": user_id},
        )
    ).first()
    return normalize_row(row) if row else None


async def create_plan(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "userId": data["userId"],
        "callsign": data["callsign"],
        "flightType": data["flightType"],
        "aircraft": data.get("aircraft", ""),
        "wakeCategory": data.get("wakeCategory", ""),
        "equipment": data.get("equipment", ""),
        "transponder": data.get("transponder", ""),
        "depIcao": data["depIcao"],
        "depTime": data.get("depTime", ""),
        "cruiseAlt": data.get("cruiseAlt", ""),
        "cruiseSpeed": data.get("cruiseSpeed", ""),
        "arrIcao": data["arrIcao"],
        "alternate": data.get("alternate", ""),
        "flightTime": data.get("flightTime", ""),
        "endurance": data.get("endurance", ""),
        "route": data.get("route", ""),
        "remarks": data.get("remarks", ""),
        "filedAt": data.get("filedAt") or zh_now_string(),
        "shareId": data.get("shareId") or generate_share_id(),
        "syncFsd": 1 if data.get("syncFsd") else 0,
    }
    now = dt.datetime.utcnow()
    result = await db.execute(
        text(
            "INSERT INTO `FlightPlan` (userId, callsign, flightType, aircraft, wakeCategory, equipment, "
            "transponder, depIcao, depTime, cruiseAlt, cruiseSpeed, arrIcao, alternate, flightTime, "
            "endurance, route, remarks, filedAt, shareId, syncFsd) VALUES "
            "(:userId, :callsign, :flightType, :aircraft, :wakeCategory, :equipment, :transponder, "
            ":depIcao, :depTime, :cruiseAlt, :cruiseSpeed, :arrIcao, :alternate, :flightTime, "
            ":endurance, :route, :remarks, :filedAt, :shareId, :syncFsd)"
        ),
        payload,
    )
    await db.commit()
    plan_id = int(result.lastrowid)
    created = await get_plan_by_id(db, plan_id)
    return created or {**payload, "id": plan_id}


async def update_plan(db: AsyncSession, plan_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {
        "callsign": "callsign",
        "flightType": "flightType",
        "aircraft": "aircraft",
        "wakeCategory": "wakeCategory",
        "equipment": "equipment",
        "transponder": "transponder",
        "depIcao": "depIcao",
        "depTime": "depTime",
        "cruiseAlt": "cruiseAlt",
        "cruiseSpeed": "cruiseSpeed",
        "arrIcao": "arrIcao",
        "alternate": "alternate",
        "flightTime": "flightTime",
        "endurance": "endurance",
        "route": "route",
        "remarks": "remarks",
        "filedAt": "filedAt",
        "shareId": "shareId",
        "syncFsd": "syncFsd",
    }
    sets, params = [], {"id": plan_id}
    for key, col in allowed.items():
        if key in data:
            sets.append(f"{col} = :{key}")
            params[key] = (1 if data[key] else 0) if key == "syncFsd" else data[key]
    if not sets:
        return await get_plan_by_id(db, plan_id)
    await db.execute(text(f"UPDATE `FlightPlan` SET {', '.join(sets)} WHERE id = :id"), params)
    await db.commit()
    return await get_plan_by_id(db, plan_id)


async def set_sync_fsd(db: AsyncSession, plan_id: int, synced: bool) -> None:
    await db.execute(
        text("UPDATE `FlightPlan` SET syncFsd = :v WHERE id = :id"),
        {"v": 1 if synced else 0, "id": plan_id},
    )
    await db.commit()


async def delete_plan(db: AsyncSession, plan_id: int) -> None:
    await db.execute(text("DELETE FROM `FlightPlan` WHERE id = :id"), {"id": plan_id})
    await db.commit()


async def list_online_pilots(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                "SELECT p.callsign, p.cid, p.realname, p.longitude AS lon, p.latitude AS lat, "
                "p.altitude, p.groundspd, p.transponder, p.transpondermd, p.updatedAt, "
                "p.heading, p.bank, p.pitch, fp.aircraft, fp.depIcao AS dep, "
                "fp.arrIcao AS dest, fp.route "
                "FROM FlightPilot p "
                "LEFT JOIN (SELECT callsign, MAX(id) AS max_id FROM FlightPlan GROUP BY callsign) t "
                "ON t.callsign = p.callsign "
                "LEFT JOIN FlightPlan fp ON fp.id = t.max_id "
                "ORDER BY p.updatedAt DESC"
            )
        )
    ).all()
    return [dict(r._mapping) for r in rows]


async def list_online_controllers(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                "SELECT callsign, cid, realname, latitude AS lat, longitude AS lon, frequency, "
                "facilityType, visualRange, updatedAt FROM FlightController ORDER BY updatedAt DESC"
            )
        )
    ).all()
    return [dict(r._mapping) for r in rows]


__all__ = [
    "FP_PATTERNS",
    "clean_field",
    "generate_share_id",
    "zh_now_string",
    "normalize_row",
    "list_plans",
    "get_plan",
    "get_plan_by_id",
    "get_plan_by_share",
    "get_latest_plan",
    "create_plan",
    "update_plan",
    "set_sync_fsd",
    "delete_plan",
    "list_online_pilots",
    "list_online_controllers",
]
