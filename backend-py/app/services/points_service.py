"""积分 / 成就数据访问（对齐 Node src/routes/points.js）。"""
from __future__ import annotations

import decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

USER_POINT_COLUMNS = "id, userId, points, exp, level, flights, hours, updatedAt"
ACHIEVEMENT_COLUMNS = "id, name, description, icon, criteria, `condition`"

LEADERBOARD_TAKE = 50


def _float(value: Any, default: float = 0) -> float:
    """Prisma Float → JSON number（DECIMAL 列会被驱动返回 Decimal，这里统一成 float）。"""
    if value is None:
        return default
    if isinstance(value, decimal.Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _point_row(row: Any) -> dict[str, Any]:
    data: dict[str, Any] = dict(row._mapping)
    for name in ("points", "exp", "level", "flights"):
        if name in data and data[name] is None:
            data[name] = 0
        elif name in data:
            data[name] = int(data[name])
    if "hours" in data:
        data["hours"] = _float(data["hours"])
    return data


def default_points(user_id: str) -> dict[str, Any]:
    """对齐 Node：找不到记录时返回的字面量对象（没有 id / updatedAt）。"""
    return {
        "userId": user_id,
        "points": 0,
        "exp": 0,
        "level": 1,
        "flights": 0,
        "hours": 0,
    }


async def get_points(db: AsyncSession, user_id: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(
                f"SELECT {USER_POINT_COLUMNS} FROM `UserPoint` WHERE userId = :uid LIMIT 1"
            ),
            {"uid": user_id},
        )
    ).first()
    return _point_row(row) if row else None


async def list_achievements(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    """``userAchievement.findMany({ where: { userId }, include: { achievement: true } })``。

    返回结构与 Prisma include 一致：``{id, userId, achievementId, earnedAt, achievement:{...}}``。
    """
    rows = (
        await db.execute(
            text(
                "SELECT ua.id AS ua_id, ua.userId AS ua_userId, "
                "ua.achievementId AS ua_achievementId, ua.earnedAt AS ua_earnedAt, "
                "a.id AS a_id, a.name AS a_name, a.description AS a_description, "
                "a.icon AS a_icon, a.criteria AS a_criteria, a.`condition` AS a_condition "
                "FROM `UserAchievement` ua "
                "LEFT JOIN `Achievement` a ON a.id = ua.achievementId "
                "WHERE ua.userId = :uid"
            ),
            {"uid": user_id},
        )
    ).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        m = r._mapping
        achievement: dict[str, Any] | None = None
        if m["a_id"] is not None:
            achievement = {
                "id": m["a_id"],
                "name": m["a_name"],
                "description": m["a_description"],
                "icon": m["a_icon"],
                "criteria": m["a_criteria"],
                "condition": m["a_condition"],
            }
        out.append(
            {
                "id": m["ua_id"],
                "userId": m["ua_userId"],
                "achievementId": m["ua_achievementId"],
                "earnedAt": m["ua_earnedAt"],
                "achievement": achievement,
            }
        )
    return out


async def leaderboard(db: AsyncSession, take: int = LEADERBOARD_TAKE) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {USER_POINT_COLUMNS} FROM `UserPoint` "
                "ORDER BY points DESC LIMIT :take"
            ),
            {"take": take},
        )
    ).all()
    return [_point_row(r) for r in rows]


__all__ = [
    "USER_POINT_COLUMNS",
    "ACHIEVEMENT_COLUMNS",
    "LEADERBOARD_TAKE",
    "default_points",
    "get_points",
    "list_achievements",
    "leaderboard",
]
