"""/api/apply 路由（逐接口对齐 Node src/routes/apply.js）。

- POST /controller  申请成为管制员（已有「待审核」的同类申请 → 409）
- POST /staff       申请成为职员（同上）
- GET  /my          我的申请列表（id desc）

三个端点均需登录（Node 每个 handler 上都挂了 authenticate）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import apply_service as aps
from app.services.js_compat_service import read_json_body
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.apply")
router = APIRouter(prefix="/apply", tags=["apply"])


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


async def _submit(
    db: AsyncSession,
    current: CurrentUser,
    type_: str,
    department: Any,
    reason: Any,
    conflict_message: str,
) -> JSJSONResponse:
    existing = await aps.find_pending(db, current.cid, type_)
    if existing:
        return _fail(409, conflict_message)
    app_row = await aps.create_application(
        db, current.cid, current.username, type_, department, reason
    )
    return _ok(app_row)


@router.post("/controller")
async def apply_controller(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        return await _submit(
            db,
            current,
            "controller",
            body.get("department"),
            body.get("reason"),
            "您已提交过管制员申请，请等待审核结果",
        )
    except Exception as exc:  # noqa: BLE001
        log.error("[apply.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("/staff")
async def apply_staff(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        return await _submit(
            db,
            current,
            "staff",
            body.get("department"),
            body.get("reason"),
            "您已提交过职员申请，请等待审核结果",
        )
    except Exception as exc:  # noqa: BLE001
        log.error("[apply.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/my")
async def my_applications(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        return _ok(await aps.list_my_applications(db, current.cid))
    except Exception as exc:  # noqa: BLE001
        log.error("[apply.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
