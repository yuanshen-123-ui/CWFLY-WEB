"""通知数据访问 + createNotification（对齐 Node src/routes/notifications.js）。

``create_notification`` 对应 Node 里被 events.js / admin.js 复用的
``export async function createNotification(userId, type, title, content = '', link = '')``，
行为一致：任何异常都被吞掉（不影响调用方主流程），且是 **独立写入**（Node 用全局 prisma）。
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.content_service import normalize_row

log = logging.getLogger("cwfly.notifications")

# `read` 是 MySQL 保留字，必须加反引号
NOTIFICATION_COLUMNS = "id, userId, type, title, content, link, `read`, createdAt"

LIST_TAKE = 50

NOTIFICATION_BOOLS = ("read",)


async def list_notifications(db: AsyncSession, user_id: str, take: int = LIST_TAKE) -> list[dict[str, Any]]:
    """GET /notifications：``orderBy id desc`` + ``take 50``。"""
    rows = (
        await db.execute(
            text(
                f"SELECT {NOTIFICATION_COLUMNS} FROM `Notification` "
                "WHERE userId = :uid ORDER BY id DESC LIMIT :take"
            ),
            {"uid": user_id, "take": take},
        )
    ).all()
    return [normalize_row(r, bools=NOTIFICATION_BOOLS) for r in rows]


async def count_unread(db: AsyncSession, user_id: str) -> int:
    row = (
        await db.execute(
            text(
                "SELECT COUNT(*) AS c FROM `Notification` "
                "WHERE userId = :uid AND `read` = 0"
            ),
            {"uid": user_id},
        )
    ).first()
    return int(row._mapping["c"] or 0) if row else 0


async def mark_read(db: AsyncSession, notification_id: int, user_id: str) -> None:
    """``updateMany({ where: { id, userId }, data: { read: true } })``。"""
    await db.execute(
        text(
            "UPDATE `Notification` SET `read` = 1 "
            "WHERE id = :id AND userId = :uid"
        ),
        {"id": notification_id, "uid": user_id},
    )
    await db.commit()


async def mark_all_read(db: AsyncSession, user_id: str) -> None:
    """``updateMany({ where: { userId, read: false }, data: { read: true } })``。"""
    await db.execute(
        text(
            "UPDATE `Notification` SET `read` = 1 "
            "WHERE userId = :uid AND `read` = 0"
        ),
        {"uid": user_id},
    )
    await db.commit()


async def _insert(
    db: AsyncSession, user_id: str, type_: str, title: str, content: str, link: str
) -> None:
    await db.execute(
        text(
            "INSERT INTO `Notification` (userId, `type`, title, content, link) "
            "VALUES (:userId, :type, :title, :content, :link)"
        ),
        {
            "userId": user_id,
            "type": type_,
            "title": title,
            "content": content,
            "link": link,
        },
    )
    await db.commit()


async def create_notification(
    user_id: str,
    type_: str,
    title: str,
    content: str = "",
    link: str = "",
    db: AsyncSession | None = None,
) -> None:
    """创建通知（内部使用）——对齐 Node ``createNotification``：失败静默。

    不传 ``db`` 时使用独立会话（等价 Node 的全局 prisma 独立写入）。
    """
    try:
        if db is not None:
            await _insert(db, user_id, type_, title, content, link)
            return
        from app.db.session import SessionLocal

        async with SessionLocal() as session:
            await _insert(session, user_id, type_, title, content, link)
    except Exception:  # noqa: BLE001 - Node: catch {}
        pass


__all__ = [
    "NOTIFICATION_COLUMNS",
    "LIST_TAKE",
    "list_notifications",
    "count_unread",
    "mark_read",
    "mark_all_read",
    "create_notification",
]
