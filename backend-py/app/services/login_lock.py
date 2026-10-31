"""登录失败锁定（对齐 Node src/routes/auth.js：LoginAttempt 表共享计数）。

同一账号 15 分钟内失败 5 次 → 锁定 15 分钟；成功登录清空。
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import users

LOGIN_LOCK_WINDOW = dt.timedelta(minutes=15)
LOGIN_LOCK_MAX_FAILS = 5
LOCK_MESSAGE = "登录失败次数过多，账号已临时锁定 15 分钟"


async def check_login_lock(db: AsyncSession, cid: str | None) -> str | None:
    """返回锁定时应给前端的文案；未锁定返回 None。"""
    if not cid:
        return None
    cutoff = dt.datetime.utcnow() - LOGIN_LOCK_WINDOW
    try:
        await users.delete_login_attempts_before(db, cid, cutoff)
        count = await users.count_login_attempts_since(db, cid, cutoff)
    except Exception:
        return None
    return LOCK_MESSAGE if count >= LOGIN_LOCK_MAX_FAILS else None


async def record_login_failure(db: AsyncSession, cid: str | None, ip: str) -> None:
    if not cid:
        return
    try:
        await users.insert_login_attempt(db, cid, ip)
    except Exception:
        pass


async def clear_login_failures(db: AsyncSession, cid: str | None) -> None:
    if not cid:
        return
    try:
        await users.delete_login_attempts(db, cid)
    except Exception:
        pass


__all__ = [
    "LOGIN_LOCK_MAX_FAILS",
    "LOCK_MESSAGE",
    "check_login_lock",
    "record_login_failure",
    "clear_login_failures",
]
