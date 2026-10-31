"""FSD 在线快照追踪（移植 Node `src/services/fsdTracker.js`）。

Node 版有两条数据通路：
  1) TCP 直连 FSD9（6809）解析 `#AP/@/%/#DP/$FP` 等协议行；
  2) HTTP/whazzup 轮询（`pollFsdApi`，每 15s 从 whazzup 缓存同步飞行员与管制员）。

本移植只保留通路 2（whazzup 文件/缓存轮询），原因：FSD9 直连需要长连接 + 挑战响应认证，
在本服务（Web API 进程）里意义有限，且 fsd-py 已把全部在线客户端写入 whazzup.txt。
行为差异（务必知会前端/运维）：
  - `is_fsd9_connected()` 恒为 False（无直连）；
  - 飞行员轨迹点只来自 15s 轮询（采样率低于直连，轨迹更稀疏）；
  - `#AP/#DA` 之外的协议字段（heading/bank/pitch 等）不解析（whazzup 不带这些列）。

对外接口与 Node 同名（snake_case）：get_pilot_trails / get_atc_clients /
get_raw_pilot_trails / is_fsd9_connected / start_fsd_tracker / stop_fsd_tracker。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional

from app.services import whazzup
from app.services.env_compat import env_bool

log = logging.getLogger("cwfly.fsd_tracker")

MAX_TRAIL_POINTS = 200
POLL_INTERVAL_SECONDS = 15.0
BROADCAST_MIN_GAP_MS = 800
STALE_CUTOFF_MS = 600_000  # 10 分钟无更新即清理（与 Node 一致）

# 轨迹：callsign(大写) → {callsign,cid,realname,rating,aircraft,dep,dest,route,
#                          firstSeen,lastSeen,current,plan,trail[]}
pilot_trails: Dict[str, Dict[str, Any]] = {}
# 管制员：callsign(大写) → {callsign,cid,realname,rating,facilityType,frequency,
#                           visualRange,lat,lon,altitude,lastSeen}
atc_clients: Dict[str, Dict[str, Any]] = {}

_poll_task: Optional["asyncio.Task[None]"] = None
_last_broadcast_ms = 0.0

# 可选：把轮询结果回写 FlightPilot / FlightController 快照表（Node 平台 API 只读、不写）。
# 默认关闭，避免与 fsd-py 的写者冲突；需要时设 FSD_SNAPSHOT_WRITE=1。
SNAPSHOT_WRITE = env_bool("FSD_SNAPSHOT_WRITE", False)


# ------------------------------------------------------------------ 工具
_PARSE_FLOAT_RE = re.compile(r"^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)")


def _parse_float(value: Any, default: float = 0.0) -> float:
    """`parseFloat(x)`：解析前导数字，无法解析返回 NaN（这里返回 default）。"""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    match = _PARSE_FLOAT_RE.match(str(value if value is not None else ""))
    if not match:
        return float(default)
    try:
        return float(match.group(1))
    except ValueError:
        return float(default)


def _first(*values: Any) -> Any:
    """`a || b || c`（跳过 falsy）。"""
    for value in values:
        if value:
            return value
    return values[-1] if values else None


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """两点间大圆距离（千米），与 Node 版同一公式。"""
    r = 6371.0
    d_lat = (lat2 - lat1) * math.pi / 180
    d_lon = (lon2 - lon1) * math.pi / 180
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) * math.sin(d_lon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _now_ms() -> int:
    return int(time.time() * 1000)


# ------------------------------------------------------------------ 只读视图
def get_pilot_trails() -> List[Dict[str, Any]]:
    """在线飞行员轨迹列表（结构逐字段对齐 Node）。"""
    result: List[Dict[str, Any]] = []
    for callsign, data in pilot_trails.items():
        current = data.get("current") or {}
        if current and current.get("lat") and current.get("lon"):
            plan = data.get("plan") or {}
            result.append(
                {
                    "callsign": callsign,
                    "cid": data.get("cid"),
                    "realname": data.get("realname"),
                    "aircraft": plan.get("aircraft") or data.get("aircraft") or "",
                    "dep": plan.get("depairport") or data.get("dep") or "",
                    "dest": plan.get("destairport") or data.get("dest") or "",
                    "route": plan.get("route") or data.get("route") or "",
                    "altitude": current.get("altitude") or 0,
                    "groundspeed": current.get("groundspeed") or 0,
                    "transponder": current.get("transponder") or 0,
                    "rating": data.get("rating") or 0,
                    "lat": current.get("lat"),
                    "lon": current.get("lon"),
                    "trail": (data.get("trail") or [])[-MAX_TRAIL_POINTS:],
                    "lastSeen": data.get("lastSeen"),
                    "firstSeen": data.get("firstSeen"),
                }
            )
    return result


def get_atc_clients() -> List[Dict[str, Any]]:
    """在线管制员列表（结构逐字段对齐 Node）。"""
    result: List[Dict[str, Any]] = []
    for data in atc_clients.values():
        result.append(
            {
                "callsign": data.get("callsign"),
                "cid": data.get("cid"),
                "realname": data.get("realname"),
                "rating": data.get("rating"),
                "facilityType": data.get("facilityType"),
                "frequency": data.get("frequency"),
                "visualRange": data.get("visualRange"),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
                "altitude": data.get("altitude") or 0,
                "lastSeen": data.get("lastSeen"),
            }
        )
    return result


def get_raw_pilot_trails() -> Dict[str, Dict[str, Any]]:
    return pilot_trails


def is_fsd9_connected() -> bool:
    """本移植无 TCP 直连，恒 False（Node 版为 connected && authenticated）。"""
    return False


# ------------------------------------------------------------------ 广播
async def broadcast_fsd_update() -> None:
    """向 Socket.IO 广播 `fsd:update`（800ms 节流，payload 与 Node 一致）。"""
    global _last_broadcast_ms
    io = None
    try:
        from app.sockets.server import get_sio  # 延迟导入，避免循环依赖

        io = get_sio()
    except Exception:  # socket 层不可用时静默（与 Node `if (!io) return` 一致）
        io = None
    if io is None:
        return

    now = _now_ms()
    if _last_broadcast_ms and now - _last_broadcast_ms < BROADCAST_MIN_GAP_MS:
        return
    _last_broadcast_ms = now

    try:
        from app.services.controller_boundaries import get_controller_boundaries

        boundaries = await get_controller_boundaries(get_atc_clients())
    except Exception:
        boundaries = []
    pilots = get_pilot_trails()
    try:
        await io.emit("fsd:update", {"pilots": pilots, "boundaries": boundaries, "time": now})
    except Exception:  # 无客户端/连接已关闭
        pass


# ------------------------------------------------------------------ 轮询主逻辑
def _upsert_pilot(p: Dict[str, Any]) -> None:
    """首次出现的飞行员建档（与 Node 一致：已有记录不覆盖档案字段）。"""
    callsign = p.get("callsign") or ""
    key = callsign.upper()
    if not key or key in pilot_trails:
        return
    pilot_trails[key] = {
        "callsign": callsign,
        "cid": p.get("cid") or "",
        "realname": p.get("realname") or "",
        "rating": p.get("rating") or 0,
        "aircraft": p.get("aircraft") or "",
        "dep": p.get("dep") or "",
        "dest": p.get("dest") or "",
        "route": p.get("route") or "",
        "firstSeen": _now_ms(),
        "lastSeen": _now_ms(),
        "current": None,
        "plan": None,
        "trail": [],
    }


async def poll_fsd_api() -> None:
    """从 whazzup 缓存同步飞行员/管制员（15s 一次）。"""
    data = whazzup.get_cached_whazzup()
    if not data:
        log.debug("[FSD-Poll] whazzup 缓存为空，跳过")
        return

    pilots = data.get("pilots") or data.get("clients") or []
    for p in pilots:
        lat = _parse_float(_first(p.get("lat"), p.get("Lat"), 0))
        lon = _parse_float(_first(p.get("lon"), p.get("Lon"), 0))
        if not lat and not lon:
            continue

        key = (p.get("callsign") or "").upper()
        if not key:
            continue
        _upsert_pilot(p)
        d = pilot_trails[key]

        now = _now_ms()
        trail = d.setdefault("trail", [])
        last = trail[-1] if trail else None
        if not last or haversine(last["lat"], last["lon"], lat, lon) > 0.5:
            trail.append({"lat": lat, "lon": lon, "time": now})
            if len(trail) > MAX_TRAIL_POINTS:
                del trail[:-MAX_TRAIL_POINTS]

        d["current"] = {
            "lat": lat,
            "lon": lon,
            "altitude": p.get("altitude") or 0,
            "groundspeed": p.get("groundspeed") or 0,
            "transponder": p.get("transponder") or 0,
        }
        d["lastSeen"] = now

    # ===== 同步管制员 =====
    controllers = data.get("controllers") or data.get("atc") or []
    for c in controllers:
        key = (c.get("callsign") or "").upper()
        if not key:
            continue
        d = atc_clients.get(key)
        if d is None:
            d = {
                "callsign": c.get("callsign"),
                "cid": c.get("cid") or "",
                "realname": c.get("realname") or "",
                "rating": c.get("rating") or 0,
                "facilityType": c.get("facilitytype") or c.get("facilityType") or 0,
                "frequency": c.get("frequency") or 0,
                "visualRange": c.get("visualrange") or c.get("visualRange") or 40,
                "lat": None,
                "lon": None,
                "altitude": 0,
                "lastSeen": _now_ms(),
            }
            atc_clients[key] = d

        lat = _parse_float(_first(c.get("lat"), c.get("Lat"), c.get("latitude"), 0))
        lon = _parse_float(_first(c.get("lon"), c.get("Lon"), c.get("longitude"), 0))
        if not (lat == 0 and lon == 0):
            d["lat"] = lat
            d["lon"] = lon
        d["frequency"] = c.get("frequency") or c.get("Frequency") or d.get("frequency")
        d["facilityType"] = c.get("facilitytype") or c.get("facilityType") or d.get("facilityType")
        d["visualRange"] = c.get("visualrange") or c.get("visualRange") or d.get("visualRange")
        d["rating"] = c.get("rating") or c.get("Rating") or d.get("rating")
        d["lastSeen"] = _now_ms()

    # 清理 10 分钟无更新的条目
    cutoff = _now_ms() - STALE_CUTOFF_MS
    for key in [k for k, v in pilot_trails.items() if (v.get("lastSeen") or 0) < cutoff]:
        pilot_trails.pop(key, None)
    for key in [k for k, v in atc_clients.items() if (v.get("lastSeen") or 0) < cutoff]:
        atc_clients.pop(key, None)

    if SNAPSHOT_WRITE:
        try:
            await persist_snapshot()
        except Exception as exc:  # 快照写失败不影响内存视图
            log.warning("[FSD-Poll] 快照落库失败: %s", exc)

    await broadcast_fsd_update()


# ------------------------------------------------------------------ 快照落库（可选）
_PILOT_UPSERT = """
INSERT INTO `FlightPilot`
    (`callsign`, `cid`, `realname`, `home`, `latitude`, `longitude`, `altitude`,
     `bank`, `pitch`, `heading`, `AltitudeC`, `groundspd`, `transponder`, `transpondermd`, `updatedAt`)
VALUES (:callsign, :cid, :realname, '', :latitude, :longitude, :altitude,
        0, 0, 0, :altitude, :groundspd, :transponder, 0, :updatedAt)
ON DUPLICATE KEY UPDATE
    `cid` = VALUES(`cid`), `realname` = VALUES(`realname`),
    `latitude` = VALUES(`latitude`), `longitude` = VALUES(`longitude`),
    `altitude` = VALUES(`altitude`), `AltitudeC` = VALUES(`AltitudeC`),
    `groundspd` = VALUES(`groundspd`), `transponder` = VALUES(`transponder`),
    `updatedAt` = VALUES(`updatedAt`)
"""

_CONTROLLER_UPSERT = """
INSERT INTO `FlightController`
    (`callsign`, `cid`, `realname`, `latitude`, `longitude`, `frequency`,
     `facilityType`, `visualRange`, `updatedAt`)
VALUES (:callsign, :cid, :realname, :latitude, :longitude, :frequency,
        :facilityType, :visualRange, :updatedAt)
ON DUPLICATE KEY UPDATE
    `cid` = VALUES(`cid`), `realname` = VALUES(`realname`),
    `latitude` = VALUES(`latitude`), `longitude` = VALUES(`longitude`),
    `frequency` = VALUES(`frequency`), `facilityType` = VALUES(`facilityType`),
    `visualRange` = VALUES(`visualRange`), `updatedAt` = VALUES(`updatedAt`)
"""


async def persist_snapshot() -> bool:
    """把内存视图 upsert 进 FlightPilot / FlightController（Node 平台侧不做写入）。"""
    from sqlalchemy import text

    from app.db.session import SessionLocal

    now = _utcnow()
    ok = True
    async with SessionLocal() as db:
        try:
            for p in get_pilot_trails():
                await db.execute(
                    text(_PILOT_UPSERT),
                    {
                        "callsign": p["callsign"],
                        "cid": p.get("cid") or "",
                        "realname": p.get("realname") or "",
                        "latitude": float(p.get("lat") or 0),
                        "longitude": float(p.get("lon") or 0),
                        "altitude": int(p.get("altitude") or 0),
                        "groundspd": int(p.get("groundspeed") or 0),
                        "transponder": int(p.get("transponder") or 0),
                        "updatedAt": now,
                    },
                )
            for c in get_atc_clients():
                await db.execute(
                    text(_CONTROLLER_UPSERT),
                    {
                        "callsign": c["callsign"],
                        "cid": c.get("cid") or "",
                        "realname": c.get("realname") or "",
                        "latitude": float(c.get("lat") or 0),
                        "longitude": float(c.get("lon") or 0),
                        "frequency": str(c.get("frequency") or ""),
                        "facilityType": int(c.get("facilityType") or 0),
                        "visualRange": int(c.get("visualRange") or 0),
                        "updatedAt": now,
                    },
                )
            await db.commit()
        except Exception:
            await db.rollback()
            ok = False
            raise
    return ok


def whazzup_now():  # 兼容旧调用名
    """写库统一用 UTC naive（对齐 Node Prisma DateTime 存 UTC）。"""
    return _utcnow()


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


# ------------------------------------------------------------------ 生命周期
async def fsd_poll_loop(interval_seconds: float = POLL_INTERVAL_SECONDS) -> None:
    """15s 轮询循环（供 `app/jobs/scheduler.py` 托管）。"""
    log.info("[FSDTraker] 启动 whazzup 轮询（%.0fs 一次，无 TCP 直连）", interval_seconds)
    while True:
        try:
            await poll_fsd_api()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("[FSDTraker] 轮询异常: %s", exc)
        await asyncio.sleep(interval_seconds)


def start_fsd_tracker(io: Any = None) -> Optional["asyncio.Task[None]"]:
    """兼容 Node `startFsdTracker(io)`：记录 io（可选）并启动轮询任务。"""
    global _poll_task
    if io is not None:
        try:
            from app.sockets import server as socket_server

            socket_server.set_sio(io)
        except Exception:
            pass
    if _poll_task is not None and not _poll_task.done():
        return _poll_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        log.warning("[FSDTraker] 无运行中的事件循环，追踪器未启动")
        return None
    _poll_task = loop.create_task(fsd_poll_loop(), name="cwfly.fsd_poll")
    return _poll_task


async def stop_fsd_tracker() -> None:
    global _poll_task
    task, _poll_task = _poll_task, None
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: B014
        pass


__all__ = [
    "MAX_TRAIL_POINTS",
    "POLL_INTERVAL_SECONDS",
    "pilot_trails",
    "atc_clients",
    "get_pilot_trails",
    "get_atc_clients",
    "get_raw_pilot_trails",
    "is_fsd9_connected",
    "broadcast_fsd_update",
    "poll_fsd_api",
    "persist_snapshot",
    "haversine",
    "fsd_poll_loop",
    "start_fsd_tracker",
    "stop_fsd_tracker",
]
