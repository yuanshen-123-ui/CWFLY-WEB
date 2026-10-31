"""启动期初始化：管理员账号（对齐 Node src/routes/auth.js initAdmin）。

规则与 Node 完全一致：
- 旧 CID 000000 存在时：0000 已存在则删除 000000，否则把 000000 迁移为 0000；
- 0000 不存在时用 ADMIN_PASSWORD 创建（缺失则拒绝启动）；
- 0000 已存在则跳过（不重置密码）。
"""
from __future__ import annotations

import logging

from sqlalchemy import text

from app.config import settings
from app.db.session import SessionLocal
from app.services.users import create_user, find_user_public
from app.utils.security import ALL_PERMISSIONS, hash_password, sha256_hex

log = logging.getLogger("cwfly.bootstrap")


async def init_admin() -> None:
    try:
        async with SessionLocal() as db:
            old = await find_user_public(db, "000000")
            if old:
                new_exists = await find_user_public(db, "0000")
                if new_exists:
                    await db.execute(text("DELETE FROM `User` WHERE cid = '000000'"))
                    await db.commit()
                    log.info("[Init] 旧管理员 000000 已删除（0000 已存在）")
                else:
                    await db.execute(
                        text("UPDATE `User` SET cid = '0000' WHERE cid = '000000'")
                    )
                    await db.commit()
                    log.info("[Init] 旧管理员 CID 000000 已迁移到 0000")

            exists = await find_user_public(db, "0000")
            if exists:
                log.info("[Init] 管理员已存在，跳过初始化")
                return

            admin_password = settings.ADMIN_PASSWORD
            if not admin_password:
                raise RuntimeError(
                    "安全错误: ADMIN_PASSWORD 环境变量未设置（首次创建管理员需要）"
                )
            await create_user(
                db,
                {
                    "cid": "0000",
                    "username": "管理员",
                    "password": hash_password(admin_password),
                    "rating": 12,
                    "permissions": ",".join(ALL_PERMISSIONS),
                    "fsdLevel": 12,
                    "fsdPasswordHash": sha256_hex(admin_password),
                },
            )
            log.info("[Init] 默认管理员已创建（CID 0000）")
    except Exception as exc:  # 与 Node 一致：初始化失败仅记录，不阻断启动
        log.error("[Init] 管理员初始化失败: %s", exc)


__all__ = ["init_admin"]
