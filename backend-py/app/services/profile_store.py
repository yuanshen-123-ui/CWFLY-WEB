"""个人中心（/api/profile）数据访问：原生 SQL，列名与 Prisma MySQL 表一致。

对齐 Node `src/routes/profile.js` 中的 prisma 调用：
- `prisma.user.findUnique({ where: { cid } })`
- `prisma.user.update({ where: { cid }, data: {...} })`
- `prisma.user.findFirst({ where: { email }, select: { cid: true } })`

注意：不改动 app/services/users.py（他人文件），此处只做本路由需要的列级操作。
"""
from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# GET / 与 PUT / 的字段集合（与 Node 的 user 对象保持一致）
_PROFILE_COLS = (
    "cid, username, rating, permissions, fsdLevel, email, qq, avatar, bgImage, createdAt"
)

# PUT /info 的返回字段（fsdType 在 User 表不存在，Node `user.fsdType ?? 'PILOT'` 恒为 'PILOT'）
_INFO_RESULT_COLS = "cid, username, rating, fsdLevel, email, qq, avatar"


def _row(row: Any) -> dict[str, Any] | None:
    return dict(row._mapping) if row is not None else None


async def get_profile(db: AsyncSession, cid: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_PROFILE_COLS} FROM `User` WHERE cid = :cid LIMIT 1"), {"cid": cid}
        )
    ).first()
    return _row(row)


async def get_password_hash(db: AsyncSession, cid: str) -> str | None:
    row = (
        await db.execute(
            text("SELECT `password` FROM `User` WHERE cid = :cid LIMIT 1"), {"cid": cid}
        )
    ).first()
    return row._mapping["password"] if row is not None else None


async def update_password(db: AsyncSession, cid: str, password_hash: str, fsd_hash: str) -> None:
    await db.execute(
        text(
            "UPDATE `User` SET `password` = :password, fsdPasswordHash = :fsd "
            "WHERE cid = :cid"
        ),
        {"password": password_hash, "fsd": fsd_hash, "cid": cid},
    )
    await db.commit()


async def get_avatar(db: AsyncSession, cid: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text("SELECT avatar FROM `User` WHERE cid = :cid LIMIT 1"), {"cid": cid}
        )
    ).first()
    return _row(row)


async def update_info(db: AsyncSession, cid: str, values: dict[str, Any]) -> None:
    """按白名单更新 avatar / qq（Node 只在这两个字段上写 data）。"""
    allowed = {"avatar", "qq"}
    sets, params = [], {"cid": cid}
    for key, value in values.items():
        if key not in allowed:
            raise ValueError(f"unsupported column: {key}")
        sets.append(f"{key} = :{key}")
        params[key] = value
    if not sets:
        return
    await db.execute(text(f"UPDATE `User` SET {', '.join(sets)} WHERE cid = :cid"), params)
    await db.commit()


async def get_info_result(db: AsyncSession, cid: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {_INFO_RESULT_COLS} FROM `User` WHERE cid = :cid LIMIT 1"), {"cid": cid}
        )
    ).first()
    return _row(row)


async def set_avatar(db: AsyncSession, cid: str, avatar: str) -> None:
    await db.execute(
        text("UPDATE `User` SET avatar = :avatar WHERE cid = :cid"),
        {"avatar": avatar, "cid": cid},
    )
    await db.commit()


async def get_bg_image(db: AsyncSession, cid: str) -> str | None:
    """返回当前背景图；用户不存在返回 None（Node `prisma.user.update` 会抛错 → 500）。"""
    row = (
        await db.execute(
            text("SELECT bgImage FROM `User` WHERE cid = :cid LIMIT 1"), {"cid": cid}
        )
    ).first()
    if row is None:
        return None
    return row._mapping["bgImage"] or ""


async def set_bg_image(db: AsyncSession, cid: str, bg_image: str) -> None:
    await db.execute(
        text("UPDATE `User` SET bgImage = :bg WHERE cid = :cid"),
        {"bg": bg_image, "cid": cid},
    )
    await db.commit()


# ---------------- 邮箱验证码（resetCode = "email|code"） ----------------
async def store_reset_code(
    db: AsyncSession, cid: str, code_value: str, expires: dt.datetime
) -> None:
    await db.execute(
        text(
            "UPDATE `User` SET resetCode = :code, resetCodeExpires = :expires WHERE cid = :cid"
        ),
        {"code": code_value, "expires": expires, "cid": cid},
    )
    await db.commit()


async def get_reset_row(db: AsyncSession, cid: str) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text("SELECT resetCode, resetCodeExpires FROM `User` WHERE cid = :cid LIMIT 1"),
            {"cid": cid},
        )
    ).first()
    return _row(row)


async def find_cid_by_email(db: AsyncSession, email: str) -> str | None:
    row = (
        await db.execute(
            text("SELECT cid FROM `User` WHERE email = :email LIMIT 1"), {"email": email}
        )
    ).first()
    return row._mapping["cid"] if row is not None else None


async def set_email_verified(db: AsyncSession, cid: str, email: str) -> None:
    await db.execute(
        text(
            "UPDATE `User` SET email = :email, resetCode = '', resetCodeExpires = NULL "
            "WHERE cid = :cid"
        ),
        {"email": email, "cid": cid},
    )
    await db.commit()


__all__ = [
    "get_profile",
    "get_password_hash",
    "update_password",
    "get_avatar",
    "update_info",
    "get_info_result",
    "set_avatar",
    "get_bg_image",
    "set_bg_image",
    "store_reset_code",
    "get_reset_row",
    "find_cid_by_email",
    "set_email_verified",
]
