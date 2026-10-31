"""工单数据访问（对齐 Node src/routes/tickets.js）。

注意 ``Ticket.createdAt`` / ``Ticket.updatedAt`` 在 Prisma 里是 **String** 列，
Node 写入的是 ``new Date().toLocaleString('zh-CN', { hour12: false })``（zh-CN 本地时间字符串）。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.content_service import normalize_row
from app.services.zh_time_service import zh_now

TICKET_COLUMNS = (
    "id, userId, title, category, priority, content, status, assignee, reply, createdAt, updatedAt"
)


async def list_tickets(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {TICKET_COLUMNS} FROM `Ticket` WHERE userId = :uid ORDER BY id DESC"
            ),
            {"uid": user_id},
        )
    ).all()
    return [normalize_row(r) for r in rows]


async def get_ticket(db: AsyncSession, ticket_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {TICKET_COLUMNS} FROM `Ticket` WHERE id = :id LIMIT 1"),
            {"id": ticket_id},
        )
    ).first()
    return normalize_row(row) if row else None


async def create_ticket(
    db: AsyncSession,
    user_id: str,
    title: Any,
    category: Any,
    priority: Any,
    content: Any,
) -> dict[str, Any]:
    now = zh_now()
    result = await db.execute(
        text(
            "INSERT INTO `Ticket` (userId, title, category, priority, content, status, "
            "createdAt, updatedAt) VALUES (:userId, :title, :category, :priority, :content, "
            ":status, :createdAt, :updatedAt)"
        ),
        {
            "userId": user_id,
            "title": title,
            "category": category or "general",
            "priority": priority or "normal",
            "content": content,
            "status": "open",
            "createdAt": now,
            "updatedAt": now,
        },
    )
    await db.commit()
    ticket_id = int(result.lastrowid)
    return await get_ticket(db, ticket_id) or {}


async def delete_ticket(db: AsyncSession, ticket_id: int) -> None:
    await db.execute(text("DELETE FROM `Ticket` WHERE id = :id"), {"id": ticket_id})
    await db.commit()


__all__ = [
    "TICKET_COLUMNS",
    "list_tickets",
    "get_ticket",
    "create_ticket",
    "delete_ticket",
]
