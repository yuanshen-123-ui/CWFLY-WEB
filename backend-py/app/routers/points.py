"""/api/points 路由（逐接口对齐 Node src/routes/points.js）。

Node 侧 ``router.use(authenticate)`` → 每个端点都带 ``Depends(get_current_user)``。
- GET /              我的积分（无记录时返回默认对象）+ 成就列表
- GET /leaderboard   积分榜（points desc，前 50）
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import points_service as ps
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.points")
router = APIRouter(prefix="/points", tags=["points"])


def _ok(data: Any = None, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return JSJSONResponse(body)


def _fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


@router.get("/leaderboard")
async def leaderboard(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        return _ok(await ps.leaderboard(db))
    except Exception as exc:  # noqa: BLE001
        log.error("[points.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("")
@router.get("/")
async def my_points(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        points = await ps.get_points(db, current.cid)
        if not points:
            points = ps.default_points(current.cid)
        achievements = await ps.list_achievements(db, current.cid)
        return _ok({"points": points, "achievements": achievements})
    except Exception as exc:  # noqa: BLE001
        log.error("[points.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
