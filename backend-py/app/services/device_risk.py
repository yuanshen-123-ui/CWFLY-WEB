"""设备风控评分（移植 Node `src/services/deviceRisk.js`）。

给「服务端签发的设备指纹」打分（0-100），输出 `allow / challenge / block`：
代理/机房特征 + 同一 fp 关联的 IP/UA 抖动（LoginLog 近 7 天）+ Device 历史（新 IP、篡改标记）。

⚠️ 与 Node 的事实差异（重要，已在交付报告注明）：
Node 版第三段用 `prisma.device.*`，但 `prisma/schema.prisma` **没有 Device model**
（只有 `DeviceBan`），因此 Node 运行时这段必然抛错并被内层 `catch {}` 吞掉 ⇒ 生产上
「Device 历史」这一路信号实际不生效。本移植保留同样结构：先尝试查 `Device` 表，
任何异常一律忽略（表不存在时行为与 Node 完全一致；若将来建表则自动开始生效）。

`PROXY_IP_FILE`（可选，CIDR 列表）用于机房/代理判定；未配置则该项不扣分（不误伤）。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import time
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.env_compat import env_int, env_str
from app.utils.client import get_client_ip

log = logging.getLogger("cwfly.device_risk")

# 风控统计窗口（天）
RISK_WINDOW_DAYS = env_int("RISK_WINDOW_DAYS", 7)
# >= 该分数拒绝（注册场景默认启用）
RISK_BLOCK_THRESHOLD = env_int("RISK_BLOCK_THRESHOLD", 80)
# >= 该分数要求额外验证（PoW / 验证码）
RISK_CHALLENGE_THRESHOLD = env_int("RISK_CHALLENGE_THRESHOLD", 50)

_cidrs: Optional[List[str]] = None
_cidr_lock: Optional[asyncio.Lock] = None


# ------------------------------------------------------------------ 代理/机房特征
def _read_cidr_file() -> List[str]:
    path = env_str("PROXY_IP_FILE", "")
    if not path:
        return []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return [line.strip() for line in fh.read().split("\n") if line.strip()]
    except Exception:
        log.warning("[DeviceRisk] 无法读取 PROXY_IP_FILE，代理/机房检测已降级为仅 header 提示")
        return []


async def load_cidrs() -> List[str]:
    """惰性加载 CIDR 清单（进程内缓存）。"""
    global _cidrs, _cidr_lock
    if _cidrs is not None:
        return _cidrs
    if _cidr_lock is None:
        _cidr_lock = asyncio.Lock()
    async with _cidr_lock:
        if _cidrs is None:
            _cidrs = await asyncio.to_thread(_read_cidr_file)
        return _cidrs


def _to_int(ip: str) -> Optional[int]:
    parts = str(ip or "").split(".")
    if len(parts) != 4:
        return None
    total = 0
    for part in parts:
        if not part.isdigit():
            return None
        value = int(part)
        if value < 0 or value > 255:
            return None
        total = ((total << 8) + value) & 0xFFFFFFFF
    return total & 0xFFFFFFFF


def ip_in_cidr(ip: str, cidr: str) -> bool:
    """`ip` 是否落在 `cidr`（如 1.2.3.0/24）内。"""
    range_part, _, bits = str(cidr or "").partition("/")
    if not range_part or "." not in range_part:
        return False
    ip_int = _to_int(ip)
    range_int = _to_int(range_part)
    if ip_int is None or range_int is None:
        return False
    prefix = int(bits) if str(bits).isdigit() else 32
    if prefix < 0 or prefix > 32:
        return False
    mask = 0 if prefix == 0 else ((0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF)
    return (ip_int & mask) == (range_int & mask)


async def looks_like_datacenter(ip: str) -> bool:
    """是否命中 PROXY_IP_FILE 的机房/代理 CIDR（IPv6 暂不检测，与 Node 一致）。"""
    if not ip or "." not in ip or ":" in ip:
        return False
    for cidr in await load_cidrs():
        try:
            if ip_in_cidr(ip, cidr):
                return True
        except Exception:  # 坏 CIDR 跳过
            continue
    return False


async def collect_proxy_hints(request: Any) -> Dict[str, bool]:
    """收集代理特征提示（来自请求头 + 可选 IP 库）。

    仅信任 nginx 覆写的 `X-Forwarded-For` / `Via` / `Forwarded`（见 deploy/nginx-tls-signal.conf）。
    """
    forwarded = request.headers.get("x-forwarded-for") or ""
    multi_hop = len(forwarded.split(",")) > 1
    via = bool(request.headers.get("via") or request.headers.get("forwarded"))
    datacenter = await looks_like_datacenter(get_client_ip(request))
    return {"multiHop": multi_hop, "via": via, "datacenter": datacenter}


# ------------------------------------------------------------------ 评分
async def _login_log_counts(fp: str, cutoff: dt.datetime) -> tuple[int, int]:
    """同一指纹在窗口内的去重 IP 数 / UA 数（LoginLog）。"""
    async with SessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT COUNT(DISTINCT `ip`) AS ips, COUNT(DISTINCT `userAgent`) AS uas "
                    "FROM `LoginLog` WHERE `deviceFp` = :fp AND `createdAt` >= :cutoff"
                ),
                {"fp": fp, "cutoff": cutoff},
            )
        ).first()
    if row is None:
        return 0, 0
    mapping = row._mapping
    return int(mapping.get("ips") or 0), int(mapping.get("uas") or 0)


def _parse_ip_set(raw: Any) -> List[str]:
    try:
        value = json.loads(raw or "[]")
        return [str(v) for v in value] if isinstance(value, list) else []
    except Exception:
        return []


async def _device_row(fp: str) -> Optional[Dict[str, Any]]:
    """读取 `Device` 历史（表不存在时返回 None，等价 Node 的 catch）。"""
    try:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    text("SELECT `riskScore`, `flags`, `ipSet` FROM `Device` WHERE `fp` = :fp LIMIT 1"),
                    {"fp": fp},
                )
            ).first()
        return dict(row._mapping) if row is not None else None
    except Exception:
        return None


async def evaluate_device_risk(
    fp: Optional[str],
    ip: Optional[str] = None,
    ua: Optional[str] = None,
    proxy_hints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """评估设备风险，永不抛错（异常时保守返回 challenge 等级）。"""
    hints = proxy_hints or {}
    try:
        if not fp:
            return {"score": 40, "flags": ["no-fp"], "decision": "challenge"}

        score = 0
        flags: List[str] = []
        cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(
            days=RISK_WINDOW_DAYS
        )

        # 1) 代理/机房特征
        if hints.get("multiHop"):
            score += 30
            flags.append("proxy-hop")
        if hints.get("datacenter"):
            score += 35
            flags.append("datacenter")
        if hints.get("via"):
            score += 15
            flags.append("via")

        # 2) 同一指纹关联的 IP 数与 UA 抖动
        try:
            ip_count, ua_count = await _login_log_counts(str(fp), cutoff)
            if ip_count >= 6:
                score += 35
                flags.append("many-ips")
            elif ip_count >= 3:
                score += 20
                flags.append("ip-change")
            if ua_count >= 4:
                score += 20
                flags.append("ua-change")
            elif ua_count >= 2:
                score += 10
        except Exception:  # 统计失败不阻断
            pass

        # 3) Device 历史（跨天记忆；Node 因无该表实际不生效）
        device = await _device_row(str(fp))
        if device:
            try:
                stored_score = int(device.get("riskScore") or 0)
            except (TypeError, ValueError):
                stored_score = 0
            if stored_score > score:
                score = stored_score
            stored_flags = str(device.get("flags") or "")
            if "tampered" in stored_flags.split(","):
                score = max(score, 90)
                flags.append("tampered")
            ip_set = _parse_ip_set(device.get("ipSet"))
            if ip and ip_set and ip not in ip_set:
                score += 15
                flags.append("new-ip")

        score = min(score, 100)
        if score >= RISK_BLOCK_THRESHOLD:
            decision = "block"
        elif score >= RISK_CHALLENGE_THRESHOLD:
            decision = "challenge"
        else:
            decision = "allow"
        return {"score": score, "flags": flags, "decision": decision}
    except Exception:
        return {"score": RISK_CHALLENGE_THRESHOLD, "flags": ["error"], "decision": "challenge"}


# ------------------------------------------------------------------ 活动记录
async def record_device_activity(
    fp: Optional[str],
    ip: Optional[str] = None,
    ua: Optional[str] = None,
    risk_event: Optional[str] = None,
) -> None:
    """记录一次设备活动（签发 / 登录成功），维护 Device 表 IP 集合与计数。

    与 Node 一致：表/列不存在时只记日志，绝不抛出。
    """
    if not fp:
        return
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    try:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    text(
                        "SELECT `lastIp`, `userAgent`, `ipSet` FROM `Device` WHERE `fp` = :fp LIMIT 1"
                    ),
                    {"fp": str(fp)},
                )
            ).first()
            if row is not None:
                current = dict(row._mapping)
                ip_set = _parse_ip_set(current.get("ipSet"))
                if ip and ip not in ip_set:
                    ip_set.append(ip)
                    if len(ip_set) > 20:
                        ip_set = ip_set[-20:]
                await db.execute(
                    text(
                        "UPDATE `Device` SET `lastIp` = :last_ip, `userAgent` = :ua, "
                        "`ipSet` = :ip_set, "
                        "`loginCount` = `loginCount` + :incr, `lastSeen` = :now WHERE `fp` = :fp"
                    ),
                    {
                        "last_ip": ip or current.get("lastIp") or "",
                        "ua": ua or current.get("userAgent") or "",
                        "ip_set": json.dumps(ip_set, ensure_ascii=False),
                        "incr": 1 if risk_event == "login" else 0,
                        "now": now,
                        "fp": str(fp),
                    },
                )
            else:
                await db.execute(
                    text(
                        "INSERT INTO `Device` (`fp`, `firstIp`, `lastIp`, `userAgent`, `ipSet`, "
                        "`loginCount`, `lastSeen`) VALUES (:fp, :ip, :ip, :ua, :ip_set, :count, :now)"
                    ),
                    {
                        "fp": str(fp),
                        "ip": ip or "",
                        "ua": ua or "",
                        "ip_set": json.dumps([ip] if ip else [], ensure_ascii=False),
                        "count": 1 if risk_event == "login" else 0,
                        "now": now,
                    },
                )
            await db.commit()
    except Exception as exc:
        log.debug("[Device] 记录失败: %s", exc)


async def flag_device_tampered(fp: Optional[str]) -> None:
    """标记指纹被篡改（验签失败时调用，累积到 90 分以上直接拒绝）。"""
    if not fp:
        return
    try:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    text("SELECT `riskScore`, `flags` FROM `Device` WHERE `fp` = :fp LIMIT 1"),
                    {"fp": str(fp)},
                )
            ).first()
            if row is not None:
                current = dict(row._mapping)
                stored_flags = str(current.get("flags") or "")
                name_list = [f for f in stored_flags.split(",") if f]
                if "tampered" not in name_list:
                    name_list.append("tampered")
                await db.execute(
                    text("UPDATE `Device` SET `riskScore` = :score, `flags` = :flags WHERE `fp` = :fp"),
                    {
                        "score": max(int(current.get("riskScore") or 0), 90),
                        "flags": ",".join(name_list),
                        "fp": str(fp),
                    },
                )
            else:
                await db.execute(
                    text(
                        "INSERT INTO `Device` (`fp`, `riskScore`, `flags`) "
                        "VALUES (:fp, 90, 'tampered')"
                    ),
                    {"fp": str(fp)},
                )
            await db.commit()
    except Exception:  # 表不存在 / 并发插入冲突：忽略（与 Node 一致）
        pass


def reset_cidr_cache() -> None:
    """测试/运维用：清空 CIDR 缓存。"""
    global _cidrs
    _cidrs = None


__all__ = [
    "RISK_WINDOW_DAYS",
    "RISK_BLOCK_THRESHOLD",
    "RISK_CHALLENGE_THRESHOLD",
    "collect_proxy_hints",
    "evaluate_device_risk",
    "record_device_activity",
    "flag_device_tampered",
    "ip_in_cidr",
    "looks_like_datacenter",
    "load_cidrs",
    "reset_cidr_cache",
]
