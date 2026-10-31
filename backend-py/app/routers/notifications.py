"""/api/notifications 路由（逐接口对齐 Node src/routes/notifications.js）。

Node 侧 ``router.use(authenticate)`` → 每个端点都带 ``Depends(get_current_user)``。
- GET /              列表（最近 50 条）+ 未读数 → ``{items, unread}``
- PUT /read/:id      标记单条已读 → ``{success:true}``（无 message）
- PUT /read-all      全部已读   → ``{success:true}``

同模块导出 ``create_notification``，对应 Node 的 ``createNotification``（events/admin 复用）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import notifications_service as ns
from app.services.js_compat_service import js_int
from app.services.notifications_service import create_notification
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.notifications")
router = APIRouter(prefix="/notifications", tags=["notifications"])


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


@router.get("")
@router.get("/")
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        items = await ns.list_notifications(db, current.cid)
        unread = await ns.count_unread(db, current.cid)
        return _ok({"items": items, "unread": unread})
    except Exception as exc:  # noqa: BLE001
        log.error("[notifications.py] %s", exc)
        return _fail(500, "操作失败")


@router.put("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        await ns.mark_all_read(db, current.cid)
        return JSJSONResponse({"success": True})
    except Exception as exc:  # noqa: BLE001
        log.error("[notifications.py] %s", exc)
        return _fail(500, "操作失败")


@router.put("/read/{notification_id}")
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        await ns.mark_read(db, js_int(notification_id), current.cid)
        return JSJSONResponse({"success": True})
    except Exception as exc:  # noqa: BLE001
        log.error("[notifications.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router", "create_notification"]
