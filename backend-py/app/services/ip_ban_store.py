"""IP 封禁 / 网络名单缓存（对齐 Node src/services/ipBan.js）。

只负责 **缓存与解析**，不实现 Express 中间件（中间件见 app/middleware/ip_ban.py）。
admin 路由在写操作后调用 `refresh_bans` / `refresh_ip_list`，与 Node 的调用点一致。

数据来源：
- `IpBan`   → 封禁管理（active=1 的记录；expiresAt 为 NULL 表示永久）
- `IpGroup` + `IpGroupMember` → 网络管理（白/黑名单集合，group.active=1）

条目解析：支持精确 IPv4、IPv6（仅字符串精确匹配）、CIDR 网段（1.2.3.0/24）。
"""
from __future__ import annotations

import datetime as dt
import time
from typing import Any, Optional

from sqlalchemy import text

from app.db.session import SessionLocal

# 缓存条目：{"type": "v4"|"v6"|"cidr", "ip", "int"?, "network"?, "mask"?, "prefix"?, "expiresAt"?}
_ban_cache: list[dict[str, Any]] = []
_white_cache: list[dict[str, Any]] = []
_black_cache: list[dict[str, Any]] = []
_last_refresh = 0


def normalize_ip(raw: Any) -> str:
    """对齐 Node `normalizeIp`：去空格、去 `::ffff:` 前缀、小写。"""
    value = str(raw or "").strip()
    if not value:
        return ""
    if value.lower().startswith("::ffff:"):
        value = value[7:]
    return value.lower()


def _ipv4_to_int(value: str) -> Optional[int]:
    parts = value.split(".")
    if len(parts) != 4:
        return None
    total = 0
    for part in parts:
        if not part.isdigit():
            return None
        number = int(part)
        if number < 0 or number > 255:
            return None
        total = (total << 8) | number
    return total & 0xFFFFFFFF


def parse_entry(raw: Any) -> Optional[dict[str, Any]]:
    """对齐 Node `parseBan`：解析单条 IP / CIDR。"""
    ip = normalize_ip(raw)
    if not ip:
        return None
    if "/" in ip:
        base, _, suffix = ip.partition("/")
        if not suffix.isdigit():
            return None
        prefix = int(suffix)
        network = _ipv4_to_int(base)
        if network is None or prefix < 0 or prefix > 32:
            return None
        mask = 0 if prefix == 0 else (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF
        return {"type": "cidr", "ip": ip, "network": network & mask, "mask": mask, "prefix": prefix}
    number = _ipv4_to_int(ip)
    if number is not None:
        return {"type": "v4", "ip": ip, "int": number}
    return {"type": "v6", "ip": ip}


def _matches(entry: dict[str, Any], ip: str, number: Optional[int]) -> bool:
    kind = entry.get("type")
    if kind == "v4" and number is not None:
        return entry.get("int") == number
    if kind == "cidr" and number is not None:
        return (number & int(entry.get("mask") or 0)) == int(entry.get("network") or 0)
    if kind == "v6":
        return entry.get("ip") == ip
    return False


async def refresh_bans() -> int:
    """从 `IpBan` 重新加载封禁缓存（对齐 Node `refreshBans`）。"""
    global _ban_cache, _last_refresh
    try:
        async with SessionLocal() as db:
            rows = (
                await db.execute(
                    text("SELECT `ip`, `expiresAt` FROM `IpBan` WHERE `active` = 1")
                )
            ).all()
        entries: list[dict[str, Any]] = []
        for row in rows:
            parsed = parse_entry(row._mapping["ip"])
            if not parsed:
                continue
            parsed["expiresAt"] = row._mapping.get("expiresAt")
            entries.append(parsed)
        _ban_cache = entries
        _last_refresh = int(time.time() * 1000)
        return len(_ban_cache)
    except Exception:  # noqa: BLE001 - 与 Node 一致：刷新失败不阻塞业务
        return len(_ban_cache)


async def refresh_ip_list() -> dict[str, int]:
    """重新加载网络管理白/黑名单（对齐 Node `refreshIpList`）。"""
    global _white_cache, _black_cache
    try:
        async with SessionLocal() as db:
            rows = (
                await db.execute(
                    text(
                        "SELECT m.`ip` AS ip, g.`type` AS type "
                        "FROM `IpGroupMember` m JOIN `IpGroup` g ON g.`id` = m.`groupId` "
                        "WHERE g.`active` = 1"
                    )
                )
            ).all()
        white: list[dict[str, Any]] = []
        black: list[dict[str, Any]] = []
        for row in rows:
            parsed = parse_entry(row._mapping["ip"])
            if not parsed:
                continue
            if row._mapping.get("type") == "white":
                white.append(parsed)
            else:
                black.append(parsed)
        _white_cache = white
        _black_cache = black
        return {"white": len(white), "black": len(black)}
    except Exception:  # noqa: BLE001
        return {"white": 0, "black": 0}


def is_ip_banned(raw_ip: Any) -> bool:
    """对齐 Node `isIpBanned`（过期条目忽略）。"""
    ip = normalize_ip(raw_ip)
    if not ip:
        return False
    number = _ipv4_to_int(ip)
    now = dt.datetime.utcnow()
    for entry in _ban_cache:
        expires = entry.get("expiresAt")
        if isinstance(expires, dt.datetime) and expires < now:
            continue
        if _matches(entry, ip, number):
            return True
    return False


def is_whitelisted(raw_ip: Any) -> bool:
    ip = normalize_ip(raw_ip)
    if not ip:
        return False
    number = _ipv4_to_int(ip)
    return any(_matches(entry, ip, number) for entry in _white_cache)


def is_ip_list_banned(raw_ip: Any) -> bool:
    ip = normalize_ip(raw_ip)
    if not ip:
        return False
    number = _ipv4_to_int(ip)
    return any(_matches(entry, ip, number) for entry in _black_cache)


__all__ = [
    "normalize_ip",
    "parse_entry",
    "refresh_bans",
    "refresh_ip_list",
    "is_ip_banned",
    "is_whitelisted",
    "is_ip_list_banned",
]
