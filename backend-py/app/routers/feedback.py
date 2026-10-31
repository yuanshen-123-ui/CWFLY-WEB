"""/api/feedback 路由（逐接口对齐 Node src/routes/feedback.js）。

- GET  /   我的反馈/投诉列表（id desc）
- POST /   提交反馈（title、content 必填；type 缺省「投诉」，status 固定「待处理」）

两个端点均需登录（Node 每个 handler 上都挂了 authenticate）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import feedback_service as fbs
from app.services.js_compat_service import read_json_body
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.feedback")
router = APIRouter(prefix="/feedback", tags=["feedback"])


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
async def list_feedback(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        return _ok(await fbs.list_feedback(db, current.cid))
    except Exception as exc:  # noqa: BLE001
        log.error("[feedback.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("")
@router.post("/")
async def create_feedback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        title = body.get("title")
        content = body.get("content")
        if not title or not content:
            return _fail(400, "缺少必填字段")
        fb = await fbs.create_feedback(db, current.cid, title, body.get("type"), content)
        return _ok(fb)
    except Exception as exc:  # noqa: BLE001
        log.error("[feedback.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
