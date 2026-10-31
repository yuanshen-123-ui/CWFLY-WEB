"""/api/tickets 路由（逐接口对齐 Node src/routes/tickets.js）。

Node 侧 ``router.use(authenticate)`` → 本模块每个端点都带 ``Depends(get_current_user)``。
- GET    /            我的工单列表（id desc）
- GET    /:id         工单详情（非本人 → 403「无权查看此工单」）
- POST   /            创建工单（createdAt/updatedAt 存 zh-CN 字符串）
- DELETE /:id         删除工单（存在关联回复 → 409）
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import tickets_service as ts
from app.services.js_compat_service import js_int, read_json_body
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.tickets")
router = APIRouter(prefix="/tickets", tags=["tickets"])


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
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        return _ok(await ts.list_tickets(db, current.cid))
    except Exception as exc:  # noqa: BLE001
        log.error("[tickets.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("")
@router.post("/")
async def create_ticket(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        title = body.get("title")
        content = body.get("content")
        if not title or not content:
            return _fail(400, "请填写标题和内容")
        ticket = await ts.create_ticket(
            db,
            current.cid,
            title,
            body.get("category"),
            body.get("priority"),
            content,
        )
        return _ok(ticket)
    except Exception as exc:  # noqa: BLE001
        log.error("[tickets.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        ticket = await ts.get_ticket(db, js_int(ticket_id))
        if not ticket:
            return _fail(404, "工单不存在")
        if str(ticket.get("userId")) != str(current.cid):
            return _fail(403, "无权查看此工单")
        return _ok(ticket)
    except Exception as exc:  # noqa: BLE001
        log.error("[tickets.py] %s", exc)
        return _fail(500, "操作失败")


@router.delete("/{ticket_id}")
async def delete_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        ticket = await ts.get_ticket(db, js_int(ticket_id))
        if not ticket:
            return _fail(404, "工单不存在")
        if str(ticket.get("userId")) != str(current.cid):
            return _fail(403, "无权删除此工单")
        await ts.delete_ticket(db, int(ticket["id"]))
        return JSJSONResponse({"success": True, "message": "工单已删除"})
    except IntegrityError as exc:
        # Prisma P2003（外键约束，存在 TicketReply）→ 409
        log.warning("[tickets.py] 删除失败（外键）: %s", exc)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return _fail(409, "该工单存在关联回复，无法删除")
    except Exception as exc:  # noqa: BLE001
        log.error("[tickets.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
