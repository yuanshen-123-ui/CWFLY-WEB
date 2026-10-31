"""设备封禁查询（对齐 Node src/services/deviceBan.js 的行为）。

Node 版使用内存缓存 + DeviceBan 表，每 60s 热加载。P0 阶段先做最小实现：
- 直接查 DeviceBan 表（列名以 Node 版为准：deviceFp / active / expiresAt）；
- 任何异常一律放行（fail-open），与 Node 版「缓存未命中不阻塞」一致；
- P3 时补上缓存/热加载与后台管理接口。
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import text

from app.db.session import SessionLocal


async def is_device_banned(device_fp: Optional[str]) -> bool:
    if not device_fp:
        return False
    try:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    text(
                        "SELECT id FROM `DeviceBan` WHERE fp = :fp LIMIT 1"
                    ),
                    {"fp": device_fp},
                )
            ).first()
            return row is not None
    except Exception:
        return False


__all__ = ["is_device_banned"]
