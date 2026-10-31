"""/api/forum 路由（逐接口对齐 Node src/routes/forum.js）。

公开：GET /boards、GET /posts、GET /posts/:id
鉴权：POST /posts、POST /posts/:id/reply
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import forum_service as fs
from app.services.js_compat_service import js_int, js_number_or, js_skip, read_json_body
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.forum")
router = APIRouter(prefix="/forum", tags=["forum"])


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


@router.get("/boards")
async def boards(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        return _ok(await fs.list_boards(db))
    except Exception as exc:  # noqa: BLE001
        log.error("[forum.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/posts")
async def posts(
    boardId: str | None = None,  # noqa: N803 - 查询参数名与 Node 一致
    page: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    try:
        board_id = js_int(boardId) if boardId else None
        skip = js_skip(page, fs.PAGE_SIZE)
        items = await fs.list_posts(db, board_id, skip)
        total = await fs.count_posts(db, board_id)
        return _ok({"items": items, "total": total})
    except Exception as exc:  # noqa: BLE001
        log.error("[forum.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/posts/{post_id}")
async def post_detail(post_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        post = await fs.get_post(db, js_int(post_id))
        if not post:
            return _fail(404, "帖子不存在")
        # Node：先 views+1，但响应里返回「自增前」的 post
        await fs.set_post_views(db, int(post["id"]), int(post.get("views") or 0) + 1)
        replies = await fs.list_replies(db, int(post["id"]))
        data: dict[str, Any] = dict(post)
        data["replies"] = replies
        return _ok(data)
    except Exception as exc:  # noqa: BLE001
        log.error("[forum.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("/posts")
async def create_post(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        title = body.get("title")
        content = body.get("content")
        if not title or not content:
            return _fail(400, "缺少标题或内容")
        board_id = js_number_or(body.get("boardId"), 1)
        post = await fs.create_post(db, board_id, current.cid, title, content)
        return _ok(post)
    except Exception as exc:  # noqa: BLE001
        log.error("[forum.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("/posts/{post_id}/reply")
async def create_reply(
    post_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await read_json_body(request)
        content = body.get("content")
        if not content:
            return _fail(400, "缺少内容")
        pid = js_int(post_id)
        reply = await fs.create_reply(db, pid, current.cid, content)
        await fs.touch_post(db, pid)
        return _ok(reply)
    except Exception as exc:  # noqa: BLE001
        log.error("[forum.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
