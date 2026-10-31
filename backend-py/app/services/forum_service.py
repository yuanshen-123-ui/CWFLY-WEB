"""论坛数据访问（对齐 Node src/routes/forum.js 里的 prisma 调用）。"""
from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.content_service import normalize_row

BOARD_COLUMNS = "id, name, description, sort"
POST_COLUMNS = "id, boardId, userId, title, content, pinned, locked, views, createdAt, updatedAt"
REPLY_COLUMNS = "id, postId, userId, content, createdAt"

POST_BOOLS = ("pinned", "locked")

PAGE_SIZE = 20


async def list_boards(db: AsyncSession) -> list[dict[str, Any]]:
    """GET /forum/boards：``orderBy: { sort: 'asc' }``。"""
    rows = (
        await db.execute(text(f"SELECT {BOARD_COLUMNS} FROM `ForumBoard` ORDER BY sort ASC"))
    ).all()
    return [normalize_row(r) for r in rows]


async def count_posts(db: AsyncSession, board_id: int | None) -> int:
    if board_id is None:
        sql = "SELECT COUNT(*) AS c FROM `ForumPost`"
        params: dict[str, Any] = {}
    else:
        sql = "SELECT COUNT(*) AS c FROM `ForumPost` WHERE boardId = :boardId"
        params = {"boardId": board_id}
    row = (await db.execute(text(sql), params)).first()
    return int(row._mapping["c"] or 0) if row else 0


async def list_posts(
    db: AsyncSession, board_id: int | None, skip: int, take: int = PAGE_SIZE
) -> list[dict[str, Any]]:
    """GET /forum/posts：``orderBy [{pinned:'desc'},{id:'desc'}]`` + skip/take。"""
    if board_id is None:
        sql = (
            f"SELECT {POST_COLUMNS} FROM `ForumPost` "
            "ORDER BY pinned DESC, id DESC LIMIT :take OFFSET :skip"
        )
        params: dict[str, Any] = {"take": take, "skip": skip}
    else:
        sql = (
            f"SELECT {POST_COLUMNS} FROM `ForumPost` WHERE boardId = :boardId "
            "ORDER BY pinned DESC, id DESC LIMIT :take OFFSET :skip"
        )
        params = {"boardId": board_id, "take": take, "skip": skip}
    rows = (await db.execute(text(sql), params)).all()
    return [normalize_row(r, bools=POST_BOOLS) for r in rows]


async def get_post(db: AsyncSession, post_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {POST_COLUMNS} FROM `ForumPost` WHERE id = :id LIMIT 1"),
            {"id": post_id},
        )
    ).first()
    return normalize_row(row, bools=POST_BOOLS) if row else None


async def set_post_views(db: AsyncSession, post_id: int, views: int) -> None:
    await db.execute(
        text("UPDATE `ForumPost` SET views = :views WHERE id = :id"),
        {"views": views, "id": post_id},
    )
    await db.commit()


async def list_replies(db: AsyncSession, post_id: int) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {REPLY_COLUMNS} FROM `ForumReply` WHERE postId = :postId ORDER BY id ASC"
            ),
            {"postId": post_id},
        )
    ).all()
    return [normalize_row(r) for r in rows]


async def create_post(
    db: AsyncSession, board_id: int, user_id: str, title: Any, content: Any
) -> dict[str, Any]:
    result = await db.execute(
        text(
            "INSERT INTO `ForumPost` (boardId, userId, title, content) "
            "VALUES (:boardId, :userId, :title, :content)"
        ),
        {"boardId": board_id, "userId": user_id, "title": title, "content": content},
    )
    await db.commit()
    post_id = int(result.lastrowid)
    return await get_post(db, post_id) or {}


async def create_reply(
    db: AsyncSession, post_id: int, user_id: str, content: Any
) -> dict[str, Any]:
    result = await db.execute(
        text(
            "INSERT INTO `ForumReply` (postId, userId, content) "
            "VALUES (:postId, :userId, :content)"
        ),
        {"postId": post_id, "userId": user_id, "content": content},
    )
    await db.commit()
    reply_id = int(result.lastrowid)
    row = (
        await db.execute(
            text(f"SELECT {REPLY_COLUMNS} FROM `ForumReply` WHERE id = :id LIMIT 1"),
            {"id": reply_id},
        )
    ).first()
    return normalize_row(row) if row else {}


async def touch_post(db: AsyncSession, post_id: int) -> None:
    """``prisma.forumPost.update({ where: { id }, data: { updatedAt: new Date() } })``。

    Prisma 在目标行不存在时抛 P2025 → 路由 catch → 500「操作失败」；这里同样抛错。
    """
    result = await db.execute(
        text("UPDATE `ForumPost` SET updatedAt = :now WHERE id = :id"),
        {"now": dt.datetime.utcnow(), "id": post_id},
    )
    await db.commit()
    if not (result.rowcount or 0):
        raise LookupError(f"ForumPost {post_id} not found")


__all__ = [
    "BOARD_COLUMNS",
    "POST_COLUMNS",
    "REPLY_COLUMNS",
    "PAGE_SIZE",
    "list_boards",
    "count_posts",
    "list_posts",
    "get_post",
    "set_post_views",
    "list_replies",
    "create_post",
    "create_reply",
    "touch_post",
]
