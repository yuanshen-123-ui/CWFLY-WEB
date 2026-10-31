"""Whazzup 在线状态（逐行移植 Node `src/services/whazzup.js`）。

职责：
1. 每 30s 读 `FSD_WHAZZUP_FILE`（fsd-py 生成的 whazzup.txt），解析成 JSON 结构；
2. 原子写入 `uploads/whazzup.json`（Node 同名文件、同缩进）；
3. 内存缓存 + `get_cached_whazzup()` 供 `GET /whazzup.json` 与 fsd_tracker 轮询使用。

与 Node 的字段一一对应（顺序也保持一致，前端/第三方按字段名读取）：
    clients / pilots / controllers / timestamp / source / connectedClients
    general{version,reload,update,connectedClients,connectedPilots,connectedControllers,timestamp}

差异（已在交付报告列明）：Node 用 `fs.readFileSync/writeFileSync`（同步阻塞），
这里改用 `asyncio.to_thread` 包住同样的文件操作，避免阻塞事件循环；行为不变。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import math
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.env_compat import PROJECT_ROOT, env_int, env_str
from app.utils.json_compat import js_iso

log = logging.getLogger("cwfly.whazzup")

# Node: path.resolve(__dirname, '../../uploads/whazzup.json')
WHAZZUP_FILE: Path = PROJECT_ROOT / "uploads" / "whazzup.json"
UPDATE_INTERVAL = 30_000  # 30 秒（毫秒，与 Node 同名常量一致）

# FSD 服务器地址（Node 用 FSD_HOST/FSD_PORT；本移植只读文件，保留变量以对齐排障日志）
FSD_HOST = env_str("FSD_HOST", "127.0.0.1")
FSD_PORT = env_int("FSD_PORT", 6809)
FSD_WHAZZUP_FILE = env_str("FSD_WHAZZUP_FILE", "/opt/cwfly/fsd-py/whazzup.txt")

cached_data: Optional[Dict[str, Any]] = None
_update_task: Optional["asyncio.Task[None]"] = None
_last_err_at = 0.0  # 对齐 Node `global.__whazzupLastErr`（60s 内只打印一次）


# ------------------------------------------------------------------ JS 语义助手
def _at(parts: List[str], idx: int) -> str:
    """`parts[idx]`，越界等价于 JS 的 `undefined`（后续按空串处理）。"""
    return parts[idx] if idx < len(parts) else ""


def _js_number(value: Any) -> float:
    """`Number(x)`：空串→0、无法解析→NaN、布尔按 0/1。"""
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if text == "":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return float("nan")


def _js_number_or_zero(value: Any) -> int:
    """`Number(x) || 0` → 整数（NaN/0 都归 0）。"""
    n = _js_number(value)
    if not math.isfinite(n) or n == 0:
        return 0
    return int(n)


def _js_round(value: float) -> int:
    """`Math.round`（.5 向上取整，区别于 Python 银行家舍入）。"""
    return int(math.floor(value + 0.5))


def _finite_or_zero(value: float) -> float:
    return value if math.isfinite(value) else 0.0


# ------------------------------------------------------------------ 解析
def parse_whazzup_client_line(line: str) -> Optional[Dict[str, Any]]:
    """解析一行 WHAZZUP 客户端记录（字段序号与 Node 完全一致）。"""
    trimmed = line.strip()
    if not trimmed or trimmed.startswith(";"):
        return None

    parts = trimmed.split(":")
    if len(parts) < 4:
        return None

    callsign = _at(parts, 0)
    cid = _at(parts, 1)
    realname = _at(parts, 2)
    type_ = "ATC" if _at(parts, 3) == "ATC" else "PILOT"

    frequency = _js_number(_at(parts, 4))
    lat = _js_number(_at(parts, 5))
    lon = _js_number(_at(parts, 6))
    altitude = _js_number(_at(parts, 7))
    groundspeed = _js_number(_at(parts, 8))

    aircraft = _at(parts, 9)
    tascruise = _js_number_or_zero(_at(parts, 10))
    depairport = _at(parts, 11)
    plan_altitude = _at(parts, 12)
    destairport = _at(parts, 13)
    rating = _js_number_or_zero(_at(parts, 16))
    transponder = _js_number_or_zero(_at(parts, 17))
    facilitytype = _js_number_or_zero(_at(parts, 18))
    visualrange = _js_number_or_zero(_at(parts, 19))
    hrsenroute = _js_number_or_zero(_at(parts, 24))
    minenroute = _js_number_or_zero(_at(parts, 25))
    hrsfuel = _js_number_or_zero(_at(parts, 26))
    minfuel = _js_number_or_zero(_at(parts, 27))
    altairport = _at(parts, 28)
    remarks = _at(parts, 29)
    route = _at(parts, 30)

    return {
        "callsign": callsign,
        "cid": cid,
        "realname": realname,
        "type": type_,
        "rating": rating,
        "frequency": _js_round(frequency * 1000) if math.isfinite(frequency) else 0,
        "lat": _finite_or_zero(lat),
        "lon": _finite_or_zero(lon),
        "altitude": _finite_or_zero(altitude),
        "groundspeed": _finite_or_zero(groundspeed),
        "transponder": transponder,
        "facilitytype": facilitytype,
        "visualrange": visualrange,
        "plan": {
            "aircraft": aircraft,
            "tascruise": tascruise,
            "depairport": depairport,
            "altitude": plan_altitude,
            "destairport": destairport,
            "hrsenroute": hrsenroute,
            "minenroute": minenroute,
            "hrsfuel": hrsfuel,
            "minfuel": minfuel,
            "altairport": altairport,
            "remarks": remarks,
            "route": route,
        },
        "starttime": int(time.time()),
    }


def _parse_text(text: str) -> Dict[str, Any]:
    """整份 whazzup 文本 → {clients, pilots, controllers, timestamp, source, connectedClients}。"""
    connected_clients = 0
    clients: List[Dict[str, Any]] = []
    in_clients = False

    for line in text.split("\n"):
        trimmed = line.strip()
        if trimmed == "!CLIENTS":
            in_clients = True
            continue
        if trimmed.startswith("!") and trimmed != "!CLIENTS":
            in_clients = False
            continue
        if trimmed.startswith("CONNECTED CLIENTS ="):
            tail = trimmed.split("=")[1] if "=" in trimmed else ""
            connected_clients = _js_number_or_zero(tail)
        if in_clients:
            client = parse_whazzup_client_line(trimmed)
            if client:
                clients.append(client)

    return {
        "clients": clients,
        "pilots": [c for c in clients if c["type"] == "PILOT"],
        "controllers": [c for c in clients if c["type"] == "ATC"],
        "timestamp": int(time.time() * 1000),
        "source": "whazzup_txt",
        "connectedClients": connected_clients,
    }


def _read_whazzup_file() -> str:
    """同步读盘（在 `asyncio.to_thread` 里执行）。"""
    with open(FSD_WHAZZUP_FILE, "r", encoding="utf-8", errors="replace") as fh:
        return fh.read()


async def fetch_whazzup_data() -> Dict[str, Any]:
    """读取并解析 whazzup.txt（失败抛 `读取 FSD whazzup 文件失败: ...`，与 Node 文案一致）。"""
    try:
        text = await asyncio.to_thread(_read_whazzup_file)
    except Exception as exc:  # FileNotFoundError / PermissionError …
        raise RuntimeError(f"读取 FSD whazzup 文件失败: {exc}") from exc
    return _parse_text(text)


async def fetch_via_fsd9() -> Dict[str, Any]:
    """后备方案（Node 版同样只是转调文件解析）。"""
    return await fetch_whazzup_data()


def _nullish(obj: Dict[str, Any], *keys: str, default: Any = 0) -> Any:
    """`a ?? b ?? c ?? default`：只跳过 None（对齐 JS 的可空合并语义）。"""
    for key in keys:
        value = obj.get(key)
        if value is not None:
            return value
    return default


def normalize_client(client: Dict[str, Any]) -> Dict[str, Any]:
    """统一标准化客户端字段（供外部/旧版 whazzup 结构使用，逐键对齐 Node）。"""
    c = client or {}
    plan = c.get("plan") or {}
    js_plan = c.get("Plan") or {}

    type_value = c.get("type") or c.get("Type")
    if not type_value:
        # Node: `c.facilitytype !== undefined ? 'ATC' : 'PILOT'`
        type_value = "ATC" if "facilitytype" in c else "PILOT"

    return {
        "callsign": c.get("callsign") or c.get("Callsign") or "",
        "cid": c.get("cid") or c.get("Cid") or c.get("CID") or "",
        "realname": c.get("realname") or c.get("Realname") or "",
        "type": type_value,
        "rating": _nullish(c, "rating", "Rating", default=0),
        "frequency": _nullish(c, "frequency", "Frequency", default=0),
        "facilitytype": _nullish(c, "facilitytype", "FacilityType", default=0),
        "visualrange": _nullish(c, "visualrange", "VisualRange", default=40),
        "latitude": _nullish(c, "lat", "Lat", "latitude", default=0),
        "longitude": _nullish(c, "lon", "Lon", "longitude", default=0),
        "altitude": _nullish(c, "altitude", "Altitude", default=0),
        "groundspeed": _nullish(c, "groundspeed", "Groundspeed", default=0),
        "transponder": _nullish(c, "transponder", "Transponder", default=0),
        "aircraft": plan.get("aircraft") or js_plan.get("Aircraft") or c.get("aircraft") or "",
        "dep": plan.get("depairport") or js_plan.get("DepAirport") or c.get("dep") or "",
        "dest": plan.get("destairport") or js_plan.get("DestAirport") or c.get("dest") or "",
        "route": plan.get("route") or js_plan.get("Route") or c.get("route") or "",
        "starttime": _nullish(c, "starttime", "Starttime", default=int(time.time())),
    }


# ------------------------------------------------------------------ 输出结构
def build_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """组装对外 JSON（general + clients/pilots/controllers）。"""
    clients = data.get("clients") or []
    pilots = data.get("pilots") or []
    controllers = data.get("controllers") or []
    now = dt.datetime.now(dt.timezone.utc)
    return {
        "general": {
            "version": "CWFLY Whazzup",
            "reload": UPDATE_INTERVAL / 1000,
            "update": js_iso(now),
            "connectedClients": len(clients),
            "connectedPilots": len(pilots),
            "connectedControllers": len(controllers),
            "timestamp": data.get("timestamp"),
        },
        "clients": clients,
        "pilots": pilots,
        "controllers": controllers,
    }


def _write_json_sync(payload: str) -> None:
    """原子写（tmp + os.replace），与 Node `writeFileSync + renameSync` 等价。"""
    WHAZZUP_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(WHAZZUP_FILE) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(payload)
    os.replace(tmp, WHAZZUP_FILE)


async def generate() -> bool:
    """生成一次 whazzup.json；成功 True，失败 False（Node 同样吞异常）。"""
    global cached_data, _last_err_at
    try:
        data = await fetch_whazzup_data()
        cached_data = data
        payload = build_payload(data)
        # Node: JSON.stringify(obj, null, 2) → 2 空格缩进、不转义中文
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        await asyncio.to_thread(_write_json_sync, text)
        return True
    except Exception as exc:
        now = time.time() * 1000
        if _last_err_at == 0 or now - _last_err_at > 60_000:
            message = str(exc)
            detailed = (
                "FSD 服务器未启动，等待连接..."
                if ("ECONNREFUSED" in message or "fetch failed" in message)
                else message
            )
            log.info("[Whazzup] %s", detailed)
            _last_err_at = now
        return False


def get_cached_whazzup() -> Optional[Dict[str, Any]]:
    """缓存快照（未就绪返回 None → 路由层与 Node 一致返回 503）。"""
    if cached_data is None:
        return None
    return build_payload(cached_data)


def get_whazzup_file_path() -> str:
    return str(WHAZZUP_FILE)


# ------------------------------------------------------------------ 定时循环
async def whazzup_loop(interval_seconds: float = UPDATE_INTERVAL / 1000) -> None:
    """立即跑一次，然后每 30s 跑一次（供 `app/jobs/scheduler.py` 托管）。"""
    log.info("[Whazzup] 启动更新器，输出到 %s", WHAZZUP_FILE)
    while True:
        await generate()
        await asyncio.sleep(interval_seconds)


def start_whazzup_updater() -> Optional["asyncio.Task[None]"]:
    """兼容 Node `startWhazzupUpdater()`：幂等地起一个后台任务。"""
    global _update_task
    if _update_task is not None and not _update_task.done():
        return _update_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        log.warning("[Whazzup] 无运行中的事件循环，更新器未启动")
        return None
    _update_task = loop.create_task(whazzup_loop(), name="cwfly.whazzup")
    return _update_task


async def stop_whazzup_updater() -> None:
    """兼容 Node `stopWhazzupUpdater()`：取消后台任务。"""
    global _update_task
    task, _update_task = _update_task, None
    if task is None or task.done():
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: B014 - 取消/异常都忽略
        pass


__all__ = [
    "WHAZZUP_FILE",
    "UPDATE_INTERVAL",
    "FSD_HOST",
    "FSD_PORT",
    "FSD_WHAZZUP_FILE",
    "parse_whazzup_client_line",
    "fetch_whazzup_data",
    "fetch_via_fsd9",
    "normalize_client",
    "build_payload",
    "generate",
    "get_cached_whazzup",
    "get_whazzup_file_path",
    "whazzup_loop",
    "start_whazzup_updater",
    "stop_whazzup_updater",
]
