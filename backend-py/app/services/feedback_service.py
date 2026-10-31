"""反馈数据访问（对齐 Node src/routes/feedback.js）。

``Feedback.time`` 是 Prisma String 列，Node 写入 ``new Date().toLocaleString('zh-CN')``。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.content_service import normalize_row
from app.services.zh_time_service import zh_now

FEEDBACK_COLUMNS = "id, userId, title, `type`, content, status, `time`"

DEFAULT_TYPE = "投诉"
DEFAULT_STATUS = "待处理"


async def list_feedback(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {FEEDBACK_COLUMNS} FROM `Feedback` WHERE userId = :uid ORDER BY id DESC"
            ),
            {"uid": user_id},
        )
    ).all()
    return [normalize_row(r) for r in rows]


async def get_feedback(db: AsyncSession, feedback_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {FEEDBACK_COLUMNS} FROM `Feedback` WHERE id = :id LIMIT 1"),
            {"id": feedback_id},
        )
    ).first()
    return normalize_row(row) if row else None


async def create_feedback(
    db: AsyncSession, user_id: str, title: Any, type_: Any, content: Any
) -> dict[str, Any]:
    result = await db.execute(
        text(
            "INSERT INTO `Feedback` (userId, title, `type`, content, status, `time`) "
            "VALUES (:userId, :title, :type, :content, :status, :time)"
        ),
        {
            "userId": user_id,
            "title": title,
            "type": type_ or DEFAULT_TYPE,
            "content": content,
            "status": DEFAULT_STATUS,
            "time": zh_now(),
        },
    )
    await db.commit()
    feedback_id = int(result.lastrowid)
    return await get_feedback(db, feedback_id) or {}


__all__ = [
    "FEEDBACK_COLUMNS",
    "DEFAULT_TYPE",
    "DEFAULT_STATUS",
    "list_feedback",
    "get_feedback",
    "create_feedback",
]
