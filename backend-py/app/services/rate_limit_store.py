"""共享限流存储（对齐 Node src/utils/rateLimitStore.js）。

- 表 `RateLimit(rateKey PK, hits INT, resetAt DATETIME(3))` 由本模块 `ensure_table()` 幂等创建；
- 每个限流器用 (scope, ip) 作为 rateKey，窗口到期自动重置；
- DB 故障时 fail-open（放行并记日志），与 Node 一致；
- 单实例部署下等价内存版，多实例（PM2 cluster / 多机）时自动共享。
"""
from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import text

log = logging.getLogger("cwfly.rate_limit_store")

_ready = False


async def ensure_table() -> None:
    """幂等建表（启动时调用）。"""
    global _ready
    if _ready:
        return
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            await db.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS `RateLimit` ("
                    "`rateKey` VARCHAR(191) NOT NULL,"
                    "`hits` INT NOT NULL DEFAULT 0,"
                    "`resetAt` DATETIME(3) NOT NULL,"
                    "PRIMARY KEY (`rateKey`),"
                    "INDEX `idx_rate_reset` (`resetAt`)"
                    ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
            await db.commit()
        _ready = True
        log.info("[RateLimitStore] RateLimit 表就绪")
    except Exception as exc:  # noqa: BLE001
        log.warning("[RateLimitStore] 建表失败（将使用内存兜底）: %s", exc)


async def increment(rate_key: str, window_seconds: int) -> tuple[int, int]:
    """递增并返回 (命中次数, 剩余秒数)；DB 故障返回 (0, window) 表示放行。"""
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            await db.execute(
                text(
                    "INSERT INTO `RateLimit` (`rateKey`, `hits`, `resetAt`) "
                    "VALUES (:k, 1, DATE_ADD(NOW(3), INTERVAL :s SECOND)) "
                    "ON DUPLICATE KEY UPDATE "
                    "`hits` = IF(`resetAt` <= NOW(3), 1, `hits` + 1), "
                    "`resetAt` = IF(`resetAt` <= NOW(3), DATE_ADD(NOW(3), INTERVAL :s SECOND), `resetAt`)"
                ),
                {"k": rate_key, "s": int(window_seconds)},
            )
            row = (
                await db.execute(
                    text("SELECT `hits`, TIMESTAMPDIFF(SECOND, NOW(3), `resetAt`) AS `left` "
                         "FROM `RateLimit` WHERE `rateKey` = :k"),
                    {"k": rate_key},
                )
            ).first()
            await db.commit()
        if row is None:
            return 1, window_seconds
        hits = int(row._mapping["hits"] or 0)
        left = int(row._mapping["left"] or 0)
        return hits, max(left, 0)
    except Exception as exc:  # noqa: BLE001
        log.warning("[RateLimitStore] increment 失败（fail-open）: %s", exc)
        return 0, window_seconds


async def decrement(rate_key: str) -> None:
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            await db.execute(
                text("UPDATE `RateLimit` SET `hits` = GREATEST(`hits` - 1, 0) WHERE `rateKey` = :k"),
                {"k": rate_key},
            )
            await db.commit()
    except Exception:  # noqa: BLE001
        pass


async def reset_key(rate_key: str) -> None:
    try:
        from app.db.session import SessionLocal

        async with SessionLocal() as db:
            await db.execute(text("DELETE FROM `RateLimit` WHERE `rateKey` = :k"), {"k": rate_key})
            await db.commit()
    except Exception:  # noqa: BLE001
        pass


__all__ = ["ensure_table", "increment", "decrement", "reset_key"]
