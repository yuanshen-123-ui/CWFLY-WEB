"""/api/dashboard 路由（逐接口对齐 Node src/routes/dashboard.js）。

GET /api/dashboard/stats（公开）
- totalUsers       User 总数
- controllerCount  fsdLevel >= 1（OBS 及以上）或 rating >= 11（SUP/ADM 平台管理员）
- eventCount       Event 总数
- onlineUsers      OnlineUser 表 2 分钟内活跃（跨实例统计）
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.dashboard")
router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _count(db: AsyncSession, sql: str) -> int:
    row = (await db.execute(text(sql))).first()
    if row is None:
        return 0
    return int(row._mapping["c"] or 0)


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        total_users = await _count(db, "SELECT COUNT(*) AS c FROM `User`")
        controller_count = await _count(
            db,
            "SELECT COUNT(*) AS c FROM `User` WHERE fsdLevel >= 1 OR rating >= 11",
        )
        event_count = await _count(db, "SELECT COUNT(*) AS c FROM `Event`")
        online_row = (
            await db.execute(
                text(
                    "SELECT COUNT(*) AS n FROM OnlineUser "
                    "WHERE lastSeen >= DATE_SUB(NOW(3), INTERVAL 2 MINUTE)"
                )
            )
        ).first()
        online_users = int(online_row._mapping["n"] or 0) if online_row is not None else 0

        data: dict[str, Any] = {
            "totalUsers": total_users,
            "controllerCount": controller_count,
            "eventCount": event_count,
            "onlineUsers": online_users,
        }
        return JSJSONResponse({"success": True, "data": data})
    except Exception as exc:  # noqa: BLE001
        log.error("[Dashboard] 查询失败: %s", exc)
        return JSJSONResponse({"success": False, "message": "查询失败"}, status_code=500)


__all__ = ["router"]
