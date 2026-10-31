"""IP 访问追踪（对齐 Node src/middleware/ipTracker.js）。

- 规则：任意 /api 请求按 (ip, 10 分钟窗口) 在内存聚合计数，每 60s 批量落库 IpVisit；
- 表不存在/DB 故障时静默跳过，不影响请求；
- `get_pending_visits()` 供 /admin/logs/network 合并「最近 60s 未落库」的实时行。
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from sqlalchemy import text

log = logging.getLogger("cwfly.ip_tracker")

WINDOW_MS = 10 * 60 * 1000
FLUSH_INTERVAL = 60.0

_pending: dict[str, dict[str, Any]] = {}
_task: asyncio.Task[None] | None = None


def window_start_of(now_ms: int | None = None) -> int:
    """对齐到整 10 分钟窗口的起始毫秒。"""
    ms = now_ms if now_ms is not None else int(time.time() * 1000)
    return (ms // WINDOW_MS) * WINDOW_MS


def record_ip(ip: str | None, device_fp: str | None = None) -> None:
    """记录一次访问（跳过 127./::1）。"""
    if not ip or ip.startswith("127.") or ip == "::1":
        return
    now = int(time.time() * 1000)
    ws = window_start_of(now)
    key = f"{ip}|{ws}"
    cur = _pending.get(key)
    if cur:
        cur["count"] += 1
        cur["last"] = now
        if device_fp:
            cur["fp"] = device_fp
    else:
        _pending[key] = {
            "ip": ip,
            "windowStart": ws,
            "count": 1,
            "first": now,
            "last": now,
            "fp": device_fp or "",
        }


def get_pending_visits() -> list[dict[str, Any]]:
    """内存中未落库的实时快照（字段与 Node getPendingVisits 一致）。"""
    return [dict(v) for v in _pending.values()]


async def flush() -> int:
    """把内存聚合写入 IpVisit（upsert），返回写入条数。"""
    if not _pending:
        return 0
    batch_items = list(_pending.items())
    _pending.clear()
    written = 0
    try:
        from app.db.session import SessionLocal
    except Exception:  # noqa: BLE001
        return 0

    async with SessionLocal() as db:
        for _key, item in batch_items:
            try:
                from datetime import datetime, timezone

                ws = datetime.fromtimestamp(item["windowStart"] / 1000, tz=timezone.utc).replace(tzinfo=None)
                first = datetime.fromtimestamp(item["first"] / 1000, tz=timezone.utc).replace(tzinfo=None)
                last = datetime.fromtimestamp(item["last"] / 1000, tz=timezone.utc).replace(tzinfo=None)
                await db.execute(
                    text(
                        "INSERT INTO `IpVisit` (`ip`, `windowStart`, `count`, `firstSeen`, `lastSeen`, `deviceFp`) "
                        "VALUES (:ip, :ws, :count, :first, :last, :fp) "
                        "ON DUPLICATE KEY UPDATE `count` = `count` + :count, `lastSeen` = :last, "
                        "`deviceFp` = IF(:fp = '', `deviceFp`, :fp)"
                    ),
                    {
                        "ip": item["ip"],
                        "ws": ws,
                        "count": item["count"],
                        "first": first,
                        "last": last,
                        "fp": item["fp"] or "",
                    },
                )
                written += 1
            except Exception:  # 表不存在/DB 未就绪时静默
                pass
        try:
            await db.commit()
        except Exception:  # noqa: BLE001
            pass
    return written


async def _flush_loop() -> None:
    while True:
        try:
            await asyncio.sleep(FLUSH_INTERVAL)
            await flush()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("[IpTracker] flush 失败: %s", exc)


def start_ip_tracker() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_flush_loop())


async def stop_ip_tracker() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
    await flush()


__all__ = [
    "record_ip",
    "get_pending_visits",
    "flush",
    "start_ip_tracker",
    "stop_ip_tracker",
    "window_start_of",
    "WINDOW_MS",
]
