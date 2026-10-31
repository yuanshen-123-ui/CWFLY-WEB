"""SecurityEvent 读写（对齐 Node src/routes/security.js 的 Prisma 用法）。

对应 Node：
- `prisma.securityEvent.create({ data })`                → insert_event / record_event（不阻塞）
- `prisma.securityEvent.count({ where })`                 → count_events
- `prisma.securityEvent.findMany({ where, orderBy, skip, take })` → list_events
- `prisma.securityEvent.groupBy({ by:['ip'], _count:{ip:true} })` → top_ips

表结构（prisma/schema.prisma model SecurityEvent）：
  id Int @id @default(autoincrement())
  ip String @default("")           userAgent String @default("")
  referrer String @default("")     path String @default("")
  country String @default("")      city String @default("")
  blocked Boolean @default(false)  createdAt DateTime @default(now())
  deviceFp String @default("")     userId String @default("")
  network String @default("")

约定（见 PORTING_GUIDE §5）：
- 表名/列名与 Prisma 完全一致（生产 Linux MySQL 区分大小写），camelCase 列用反引号；
- 布尔列存 0/1，读出转 True/False；
- DATETIME 存 UTC。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import SessionLocal

log = logging.getLogger("cwfly.security_events")

# SecurityEvent 数据保留期（小时）。
# Node: Math.max(1, parseInt(process.env.SECURITY_RETENTION_HOURS || '720', 10))  → 默认 30 天
_DEFAULT_RETENTION_HOURS = 720
_LEADING_INT = re.compile(r"^[+-]?\d+")


def parse_int_like_js(value: Any) -> int | None:
    """复刻 JS `parseInt(value, 10)`：取前导整数，取不到返回 None（JS 的 NaN）。"""
    if value is None:
        return None
    m = _LEADING_INT.match(str(value).lstrip())
    if not m:
        return None
    try:
        return int(m.group(0))
    except ValueError:
        return None


def _retention_hours() -> int:
    raw = os.environ.get("SECURITY_RETENTION_HOURS") or str(_DEFAULT_RETENTION_HOURS)
    parsed = parse_int_like_js(raw)
    # Node 侧 parseInt 失败会得到 NaN（端点直接 500）；这里回退默认值，避免因环境变量写错而整体不可用
    if parsed is None:
        parsed = _DEFAULT_RETENTION_HOURS
    return max(1, parsed)


SECURITY_RETENTION_HOURS = _retention_hours()

# 列顺序与 Prisma model 字段顺序一致（Node res.json 输出的 key 顺序即 Prisma 返回顺序）
_EVENT_COLUMNS = (
    "`id`, `ip`, `userAgent`, `referrer`, `path`, `country`, `city`, "
    "`blocked`, `createdAt`, `deviceFp`, `userId`, `network`"
)

_INSERT_COLUMNS = {
    # Python 关键字 → 数据库列名
    "ip": "`ip`",
    "userAgent": "`userAgent`",
    "referrer": "`referrer`",
    "path": "`path`",
    "deviceFp": "`deviceFp`",
    "userId": "`userId`",
    "network": "`network`",
    "country": "`country`",
    "city": "`city`",
    "blocked": "`blocked`",
}


def _row_to_event(row: Any) -> dict[str, Any]:
    data = dict(row._mapping)
    data["blocked"] = bool(data.get("blocked"))
    return data


def _filters(cutoff: dt.datetime, ip: str, fp: str, uid: str) -> tuple[str, dict[str, Any]]:
    """构造与 Prisma `where` 等价的 WHERE 片段（contains → LIKE '%v%'）。

    注意：只对非空值追加条件（Node 用展开语法 `...(ipFilter ? {...} : {})`）。
    """
    sql = " WHERE `createdAt` >= :cutoff"
    params: dict[str, Any] = {"cutoff": cutoff}
    if ip:
        sql += " AND `ip` LIKE :ip"
        params["ip"] = f"%{ip}%"
    if fp:
        sql += " AND `deviceFp` LIKE :fp"
        params["fp"] = f"%{fp}%"
    if uid:
        sql += " AND `userId` LIKE :uid"
        params["uid"] = f"%{uid}%"
    return sql, params


async def insert_event(db: AsyncSession, data: dict[str, Any]) -> None:
    """等价 `prisma.securityEvent.create({ data })`（只写传入的列，其余走表默认值）。"""
    columns: list[str] = []
    values: list[str] = []
    params: dict[str, Any] = {}
    for key, column in _INSERT_COLUMNS.items():
        if key not in data:
            continue
        value = data[key]
        if key == "blocked":
            value = 1 if value else 0
        columns.append(column)
        values.append(f":{key}")
        params[key] = value

    sql = f"INSERT INTO `SecurityEvent` ({', '.join(columns)}) VALUES ({', '.join(values)})"
    await db.execute(text(sql), params)
    await db.commit()


async def record_event(data: dict[str, Any]) -> None:
    """独立会话写一条事件（供 fire-and-forget 用，异常由调用方吞掉）。"""
    async with SessionLocal() as db:
        await insert_event(db, data)


def record_event_bg(data: dict[str, Any], tag: str = "[SecurityEvent]") -> None:
    """Node `prisma.securityEvent.create(...).catch(...)` 的等价实现：

    立即返回、不阻塞响应；失败只打日志（生产静默，与 Node
    `if (process.env.NODE_ENV !== 'production')` 一致）。
    `tag` 对应 Node 各端点不同的日志前缀（[SecurityEvent] / [NetworkInfo]）。
    """

    async def _run() -> None:
        try:
            await record_event(data)
        except Exception as exc:  # noqa: BLE001 - 埋点写库失败不能影响业务
            if not settings.is_prod:
                log.error("%s 写入失败: %s", tag, exc)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:  # 无事件循环（同步上下文）
        pass


async def count_events(
    db: AsyncSession, cutoff: dt.datetime, ip: str = "", fp: str = "", uid: str = ""
) -> int:
    where, params = _filters(cutoff, ip, fp, uid)
    row = (await db.execute(text(f"SELECT COUNT(*) AS `cnt` FROM `SecurityEvent`{where}"), params)).first()
    return int(row._mapping["cnt"]) if row else 0


async def list_events(
    db: AsyncSession,
    cutoff: dt.datetime,
    skip: int,
    take: int,
    ip: str = "",
    fp: str = "",
    uid: str = "",
) -> list[dict[str, Any]]:
    where, params = _filters(cutoff, ip, fp, uid)
    params = {**params, "take": int(take), "skip": int(skip)}
    rows = (
        await db.execute(
            text(
                f"SELECT {_EVENT_COLUMNS} FROM `SecurityEvent`{where} "
                "ORDER BY `createdAt` DESC LIMIT :take OFFSET :skip"
            ),
            params,
        )
    ).all()
    return [_row_to_event(r) for r in rows]


async def top_ips(db: AsyncSession, cutoff: dt.datetime, take: int = 20) -> list[dict[str, Any]]:
    """Node: groupBy({ by:['ip'], where:{createdAt:{gte:cutoff}}, _count, orderBy desc, take:20 })。

    注意：Node 的 topIps 只按时间过滤，不受 ip/fp/uid 查询条件影响，这里保持一致。
    """
    rows = (
        await db.execute(
            text(
                "SELECT `ip`, COUNT(*) AS `cnt` FROM `SecurityEvent` "
                "WHERE `createdAt` >= :cutoff GROUP BY `ip` "
                "ORDER BY `cnt` DESC LIMIT :take"
            ),
            {"cutoff": cutoff, "take": int(take)},
        )
    ).all()
    return [{"ip": r._mapping.get("ip"), "count": int(r._mapping["cnt"])} for r in rows]


def js_string(value: Any) -> str:
    """复刻 JS `String(v)`：None → "null"，True → "true"，数字原样。"""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)
    return str(value)


def js_json_dumps(value: Any) -> str:
    """复刻 JS `JSON.stringify(obj)`（无空格、不转义中文）。"""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


__all__ = [
    "SECURITY_RETENTION_HOURS",
    "parse_int_like_js",
    "insert_event",
    "record_event",
    "record_event_bg",
    "count_events",
    "list_events",
    "top_ips",
    "js_string",
    "js_json_dumps",
]
