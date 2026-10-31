"""设备指纹封禁（对齐 Node src/services/deviceBan.js）。

证据链来源：
- `User.registerFp`          注册时指纹
- `LoginLog.deviceFp`        每次登录指纹（取最近 200 条）
- `SecurityEvent.deviceFp`   安全事件指纹（取最近 200 条）

注意：`DeviceBan` 表的主列名是 **`fp`**（prisma `DeviceBan.fp`）。
已存在的 `app/services/device_ban.py` 使用的列名是 `deviceFp`，属于另一条调用链，
本文件不修改它，仅服务于 /api/admin 的设备封禁管理接口。

缓存：进程内 Set + 写操作即时刷新（与 Node 的 60s 定时兜底等价，
Python 端在启动/写操作后刷新；未命中缓存时 fail-open）。
"""
from __future__ import annotations

import datetime as dt
import time
from typing import Any, Optional

from sqlalchemy import text

from app.db.session import SessionLocal

_fp_cache: set[str] = set()
_last_refresh = 0


async def refresh_device_bans() -> int:
    """全量刷新设备指纹黑名单缓存（对齐 Node `refreshDeviceBans`）。"""
    global _fp_cache, _last_refresh
    try:
        async with SessionLocal() as db:
            rows = (await db.execute(text("SELECT `fp` FROM `DeviceBan`"))).all()
        _fp_cache = {str(r._mapping["fp"] or "").strip() for r in rows if r._mapping["fp"]}
        _last_refresh = int(time.time() * 1000)
        return len(_fp_cache)
    except Exception:  # noqa: BLE001 - 与 Node 一致：刷新失败保留旧缓存
        return len(_fp_cache)


async def ensure_device_bans_loaded() -> None:
    if _last_refresh == 0:
        await refresh_device_bans()


def is_fp_banned(fp: Optional[str]) -> bool:
    """判断设备指纹是否被封禁（空指纹不拦截，避免误伤无指纹客户端）。"""
    if not fp:
        return False
    return str(fp).strip() in _fp_cache


async def ban_device_fp(fp: Any, reason: str = "", banned_by: str = "system") -> Optional[dict[str, str]]:
    """封禁单个设备指纹（幂等 upsert，对齐 Node `banDeviceFp`）。"""
    value = str(fp or "").strip()
    if not value:
        return None
    async with SessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO `DeviceBan` (`fp`, `reason`, `bannedBy`, `bannedAt`) "
                "VALUES (:fp, :reason, :by, :at) ON DUPLICATE KEY UPDATE "
                "`reason` = VALUES(`reason`), `bannedBy` = VALUES(`bannedBy`)"
            ),
            {
                "fp": value,
                "reason": reason or "",
                "by": banned_by or "",
                "at": dt.datetime.utcnow(),
            },
        )
        await db.commit()
    _fp_cache.add(value)
    return {"fp": value}


async def collect_user_device_fps(cid: Any) -> list[str]:
    """收集一个用户关联的全部设备指纹（注册 + 登录日志 + 安全事件）。"""
    uid = str(cid or "")
    if not uid:
        return []
    fps: list[str] = []
    seen: set[str] = set()

    def _add(value: Any) -> None:
        item = str(value or "").strip()
        if item and item not in seen:
            seen.add(item)
            fps.append(item)

    async with SessionLocal() as db:
        row = (
            await db.execute(text("SELECT `registerFp` FROM `User` WHERE `cid` = :cid"), {"cid": uid})
        ).first()
        if row is not None:
            _add(row._mapping.get("registerFp"))
        logs = (
            await db.execute(
                text(
                    "SELECT `deviceFp` FROM `LoginLog` WHERE `userId` = :cid "
                    "ORDER BY `id` DESC LIMIT 200"
                ),
                {"cid": uid},
            )
        ).all()
        for item in logs:
            _add(item._mapping.get("deviceFp"))
        events = (
            await db.execute(
                text(
                    "SELECT `deviceFp` FROM `SecurityEvent` WHERE `userId` = :cid "
                    "ORDER BY `id` DESC LIMIT 200"
                ),
                {"cid": uid},
            )
        ).all()
        for item in events:
            _add(item._mapping.get("deviceFp"))
    return fps


async def ban_user_devices(cid: Any, reason: str = "", banned_by: str = "system") -> list[str]:
    """封禁用户全部设备指纹，返回实际封禁的指纹列表。"""
    banned: list[str] = []
    for fp in await collect_user_device_fps(cid):
        try:
            await ban_device_fp(fp, reason, banned_by)
            banned.append(fp)
        except Exception:  # noqa: BLE001 - 单条失败不影响其余（对齐 Node）
            continue
    return banned


def _utcnow():
    return dt.datetime.utcnow()


__all__ = [
    "refresh_device_bans",
    "ensure_device_bans_loaded",
    "is_fp_banned",
    "ban_device_fp",
    "collect_user_device_fps",
    "ban_user_devices",
]
