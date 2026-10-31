"""Socket.IO 实时通道（逐行移植 Node `server.js` 第 50–160 行）。

事件契约（与 Node **完全一致**，前端零改动）：

    客户端 → 服务端                    载荷                    服务端行为
    ---------------------------------------------------------------------------
    user:online                      —                       更新 OnlineUser + IP 跳变上报 + 广播在线数
    user:heartbeat                   —                       续期 OnlineUser.lastSeen
    event:join                       eventId                 加入房间 event:<eventId>，向房间其他人发 event:user-joined
    event:leave                      eventId                 退出房间
    event:message                    {eventId, text}         截断 500 字后向房间（含自己）广播 event:message
    disconnect                       —                       广播在线数（不删记录，由 60s 清理兜底）

    服务端 → 客户端
    online:count                     number
    online:list                      [{cid, username, lastSeen(ISO)}]
    event:user-joined                {socketId}
    event:message                    {socketId, username, text, time("2026/8/22 16:30:05")}
    fsd:update                       {pilots, boundaries, time}   （由 app/services/fsd_tracker.py 广播）

连接鉴权（与 Node 的差异见下）：
    token 取 `handshake.auth.token`，回退 `?token=`；用 `app.services.token.verify_token` 验证
    （同一套时段轮换密钥，与 HTTP Bearer 完全互通），验证通过后身份写入 socket session，
    之后所有事件**只信服务端身份**（不信任客户端上报的 cid/username）。

差异（交付报告已列明）：
1. Node 允许匿名连接、token 非法时静默降级为匿名；本实现：**无 token 仍允许**（只读/在线数
   功能需要），**带 token 但无效/过期时拒绝连接**（`ConnectionRefusedError`），符合本次任务要求。
   可用环境变量 `SOCKET_REQUIRE_VALID_TOKEN=0` 回退成 Node 的宽松行为。
2. 房间进出、广播对象、字段名、时间格式与 Node 一致；`event:message` 的 `time` 用服务端本地时间
   `Y/M/D HH:MM:SS`（等价 Node `new Date().toLocaleString('zh-CN')`）。
3. `event:*` 处理函数对畸形载荷做了防御（Node 在 data 为 undefined 时会抛 TypeError），
   正常载荷下行为完全相同。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
import time
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs

import socketio
from sqlalchemy import text

from app.config import settings
from app.db.session import SessionLocal
from app.services.env_compat import env_bool, env_int
from app.services.token import TokenError, verify_token
from app.utils.json_compat import js_iso

log = logging.getLogger("cwfly.sockets")


def _now_ms() -> float:
    """毫秒时间戳（对齐 JS `Date.now()`）。"""
    return time.time() * 1000

# 在线判定窗口：lastSeen 2 分钟内视为在线（Node 硬编码 2 MINUTE）
ONLINE_WINDOW_SQL = "DATE_SUB(NOW(3), INTERVAL 2 MINUTE)"
ONLINE_CLEANUP_INTERVAL_SECONDS = 60.0

# 是否拒绝「带了 token 但无效/过期」的连接（任务要求；设 0 回退 Node 宽松行为）
REQUIRE_VALID_TOKEN = env_bool("SOCKET_REQUIRE_VALID_TOKEN", True)

# ---------------------------------------------------------------- 事件名常量
EV_ONLINE = "user:online"
EV_HEARTBEAT = "user:heartbeat"
EV_JOIN = "event:join"
EV_LEAVE = "event:leave"
EV_MESSAGE = "event:message"
EV_USER_JOINED = "event:user-joined"
EV_ONLINE_COUNT = "online:count"
EV_ONLINE_LIST = "online:list"
EV_FSD_UPDATE = "fsd:update"


# ---------------------------------------------------------------- 服务器实例
# ---- 多 worker 实时一致性：配置 Redis 时启用共享 manager ----
_redis_url = os.getenv("SOCKETIO_REDIS_URL", "").strip()
_client_manager = None
if _redis_url:
    try:
        _client_manager = socketio.AsyncRedisManager(_redis_url)
        logging.getLogger("cwfly.sockets").info("[Socket.IO] 使用 Redis manager: %s", _redis_url)
    except Exception as _exc:  # noqa: BLE001
        logging.getLogger("cwfly.sockets").warning("[Socket.IO] Redis manager 初始化失败，回退进程内: %s", _exc)


sio = socketio.AsyncServer(
    client_manager=_client_manager,
    async_mode="asgi",
    cors_allowed_origins=[settings.cors_origin],
    cors_credentials=True,
    logger=False,
    engineio_logger=False,
    # 与 Node 默认一致：允许升级、pingInterval/pingTimeout 用 engine.io 默认值
)

# 供 Lead 用 `app.mount("/socket.io", socket_app)` 之外的场景直接挂载；
# 推荐走 app/asgi.py（socketio.ASGIApp(sio, other_asgi_app=fastapi_app)）。
socket_app = socketio.ASGIApp(sio, socketio_path="socket.io")

_sio_override: Optional[Any] = None


def get_sio() -> Any:
    """当前 AsyncServer（fsd_tracker 广播用；可被 set_sio 覆盖，便于测试）。"""
    return _sio_override or sio


def set_sio(instance: Any) -> None:
    global _sio_override
    _sio_override = instance


# ---------------------------------------------------------------- JS 语义助手
def _js_str(value: Any) -> str:
    """模板字符串插值 `String(x)` 的常用形态。"""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value
    return str(value)


def _js_or(value: Any, default: Any) -> Any:
    """`value || default`（falsy: None/''/0/False）。"""
    if value is None or value == "" or value is False or value == 0:
        return default
    return value


def _zh_cn_locale_string(now: Optional[dt.datetime] = None) -> str:
    """复刻 Node `new Date().toLocaleString('zh-CN')` → `2026/8/22 16:30:05`。"""
    current = now or dt.datetime.now()
    return (
        f"{current.year}/{current.month}/{current.day} "
        f"{current.hour:02d}:{current.minute:02d}:{current.second:02d}"
    )


def _extract_token(auth: Any, environ: Dict[str, Any]) -> str:
    """`handshake.auth.token` 优先，回退 `?token=`（与 Node 取值顺序一致）。"""
    token = ""
    if isinstance(auth, dict):
        token = str(auth.get("token") or "").strip()
    if not token:
        query = environ.get("QUERY_STRING") or ""
        if query:
            try:
                token = (parse_qs(query).get("token") or [""])[0].strip()
            except Exception:
                token = ""
    return token


# ---------------------------------------------------------------- 在线快照（OnlineUser）
async def online_count() -> int:
    """2 分钟内活跃的在线人数（跨实例共享，读 OnlineUser 表）。"""
    try:
        async with SessionLocal() as db:
            row = (
                await db.execute(
                    text(f"SELECT COUNT(*) AS n FROM `OnlineUser` WHERE `lastSeen` >= {ONLINE_WINDOW_SQL}")
                )
            ).first()
        return int(row._mapping["n"] or 0) if row is not None else 0
    except Exception:
        return 0


async def online_list() -> List[Dict[str, Any]]:
    """2 分钟内活跃的在线列表（lastSeen 输出 JS ISO 字符串）。"""
    try:
        async with SessionLocal() as db:
            rows = (
                await db.execute(
                    text(
                        "SELECT `cid`, `username`, `lastSeen` FROM `OnlineUser` "
                        f"WHERE `lastSeen` >= {ONLINE_WINDOW_SQL} ORDER BY `lastSeen` DESC"
                    )
                )
            ).all()
        result: List[Dict[str, Any]] = []
        for row in rows:
            mapping = row._mapping
            last_seen = mapping["lastSeen"]
            result.append(
                {
                    "cid": mapping["cid"],
                    "username": mapping["username"],
                    "lastSeen": js_iso(last_seen)
                    if isinstance(last_seen, dt.datetime)
                    else last_seen,
                }
            )
        return result
    except Exception:
        return []


async def broadcast_online() -> None:
    """向所有连接广播 online:count / online:list（Node `broadcastOnline`）。"""
    count, rows = await asyncio.gather(online_count(), online_list())
    server = get_sio()
    try:
        await server.emit(EV_ONLINE_COUNT, count)
    except Exception:
        pass
    try:
        await server.emit(EV_ONLINE_LIST, rows)
    except Exception:
        pass


async def cleanup_online_users() -> None:
    """清理 2 分钟无心跳的僵尸连接，然后广播（Node 每 60s 的 setInterval）。"""
    try:
        async with SessionLocal() as db:
            await db.execute(
                text(f"DELETE FROM `OnlineUser` WHERE `lastSeen` < {ONLINE_WINDOW_SQL}")
            )
            await db.commit()
    except Exception as exc:
        log.warning("[OnlineUser 清理失败] %s", exc)
        return
    await broadcast_online()


async def _mark_online(cid: str, username: str) -> None:
    try:
        async with SessionLocal() as db:
            await db.execute(
                text(
                    "INSERT INTO `OnlineUser` (`cid`, `username`, `lastSeen`) "
                    "VALUES (:cid, :username, NOW(3)) "
                    "ON DUPLICATE KEY UPDATE `username` = VALUES(`username`), `lastSeen` = NOW(3)"
                ),
                {"cid": cid, "username": username},
            )
            await db.commit()
    except Exception as exc:
        log.warning("[OnlineUser 上线失败] %s", exc)


async def _touch_online(cid: str) -> None:
    try:
        async with SessionLocal() as db:
            await db.execute(
                text("UPDATE `OnlineUser` SET `lastSeen` = NOW(3) WHERE `cid` = :cid"),
                {"cid": cid},
            )
            await db.commit()
    except Exception as exc:
        log.warning("[OnlineUser 心跳失败] %s", exc)


# ---------------------------------------------------------------- IP 跳变上报
# 移植 Node src/services/ipHopping.js 的 Socket.IO 入口（trackSocketIp）：
# 同一 cid 上一次活跃 IP 不同且间隔 ≤ 60s → 写 SecurityEvent(path='ip-hop')，
# 同一 (oldIp,newIp) 组合 10 分钟内只记一次；内存状态超 2 万条时清理 24h 未活跃者。
IP_HOP_WINDOW_MS = env_int("IP_HOP_WINDOW_MS", 60) * 1000
IP_HOP_COOLDOWN_MS = env_int("IP_HOP_COOLDOWN_MS", 10) * 60 * 1000
_MAX_STATE = 20000
_MAX_HOPS_PER_USER = 20

_user_ip_state: Dict[str, Dict[str, Any]] = {}


def _prune_ip_state() -> None:
    if len(_user_ip_state) <= _MAX_STATE:
        return
    cutoff = _now_ms() - 24 * 3600 * 1000
    for uid in [k for k, v in _user_ip_state.items() if v.get("lastActiveAt", 0) < cutoff]:
        _user_ip_state.pop(uid, None)


async def _record_ip_hop(user_id: str, old_ip: str, new_ip: str, gap_ms: float, same_device: bool, device_fp: str) -> None:
    try:
        async with SessionLocal() as db:
            await db.execute(
                text(
                    "INSERT INTO `SecurityEvent` "
                    "(`ip`, `userAgent`, `referrer`, `path`, `country`, `city`, `blocked`, "
                    " `createdAt`, `deviceFp`, `userId`, `network`) "
                    "VALUES (:ip, '', '', 'ip-hop', '', '', 0, NOW(3), :fp, :uid, :network)"
                ),
                {
                    "ip": new_ip,
                    "fp": device_fp or "",
                    "uid": user_id,
                    "network": (
                        '{"oldIp":"%s","newIp":"%s","gapMs":%d,"sameDevice":%s}'
                        % (old_ip, new_ip, int(gap_ms), "true" if same_device else "false")
                    ),
                },
            )
            await db.commit()
    except Exception as exc:
        if settings.NODE_ENV != "production":
            log.debug("[IpHop] 写入失败: %s", exc)
    log.warning(
        "[IpHop] 检测到 IP 跳变: user=%s %s -> %s gap=%sms sameDevice=%s",
        user_id,
        old_ip,
        new_ip,
        int(gap_ms),
        same_device,
    )


def track_socket_user_ip(user_id: Optional[str], ip: Optional[str], device_fp: str = "") -> None:
    """上报一次 Socket.IO 上线活跃（同 IP 跳变判定，与 Node `trackUserIp` 等价）。"""
    if not user_id or not ip:
        return
    now = _now_ms()
    previous = _user_ip_state.get(str(user_id))

    if previous and previous.get("ip") and previous["ip"] != ip and (now - previous.get("lastActiveAt", 0)) <= IP_HOP_WINDOW_MS:
        pair_key = "|".join(sorted([str(previous["ip"]), str(ip)]))
        hops: Dict[str, float] = previous.setdefault("recentHops", {})
        last_hop = hops.get(pair_key)
        if last_hop is None or (now - last_hop) >= IP_HOP_COOLDOWN_MS:
            hops[pair_key] = now
            if len(hops) > _MAX_HOPS_PER_USER:
                oldest = next(iter(hops))
                hops.pop(oldest, None)
            try:
                asyncio.get_running_loop().create_task(
                    _record_ip_hop(
                        str(user_id),
                        str(previous["ip"]),
                        str(ip),
                        now - previous.get("lastActiveAt", now),
                        previous.get("deviceFp") == device_fp,
                        device_fp,
                    )
                )
            except RuntimeError:  # 无事件循环（例如单测直接调用）
                pass

    _user_ip_state[str(user_id)] = {
        "ip": ip,
        "deviceFp": device_fp,
        "lastActiveAt": now,
        "recentHops": previous.get("recentHops", {}) if previous else {},
    }
    _prune_ip_state()


def _socket_ip(environ: Dict[str, Any]) -> str:
    """握手取 IP：`X-Forwarded-For` 首段 → 对端地址（与 Node 同序）。"""
    forwarded = (environ.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    return environ.get("REMOTE_ADDR") or ""


# ---------------------------------------------------------------- 连接/鉴权
async def _get_user(sid: str) -> Optional[Dict[str, Any]]:
    try:
        session = await sio.get_session(sid)
    except Exception:
        return None
    user = (session or {}).get("user")
    return user if isinstance(user, dict) else None


@sio.event
async def connect(sid: str, environ: Dict[str, Any], auth: Any = None) -> None:
    """握手：解析并验证 JWT，成功后把身份存入 socket session。"""
    token = _extract_token(auth, environ)
    user: Optional[Dict[str, Any]] = None
    if token:
        try:
            user = verify_token(token)
        except TokenError as exc:
            if REQUIRE_VALID_TOKEN:
                log.info("[Socket.IO] 拒绝连接 %s：%s", sid, exc)
                # ⚠️ 必须是 socketio.exceptions.ConnectionRefusedError（内置同名异常不会被捕获，
                # 会导致连接被“静默丢弃”而前端一直挂起）
                raise socketio.exceptions.ConnectionRefusedError(
                    "Token 无效或已过期"
                ) from None
            user = None
    await sio.save_session(sid, {"user": user, "ip": _socket_ip(environ)})
    log.info("[Socket.IO] 用户连接: %s", sid)


@sio.event
async def disconnect(sid: str, *args: Any) -> None:
    """断开：不立即删在线记录（同用户可能多标签/多实例），由 60s 清理兜底。"""
    log.info("[Socket.IO] 用户断开: %s", sid)
    await broadcast_online()


# ---------------------------------------------------------------- 业务事件
@sio.on(EV_ONLINE)
async def on_user_online(sid: str) -> None:
    """用户上线（身份只从 JWT session 取，不信任客户端输入）。"""
    user = await _get_user(sid)
    cid = (user or {}).get("cid")
    if not cid:
        return
    try:
        session = await sio.get_session(sid)
        ip = (session or {}).get("ip") or ""
    except Exception:
        ip = ""
    track_socket_user_ip(str(cid), ip)
    await _mark_online(str(cid), str((user or {}).get("username") or ""))
    await broadcast_online()


@sio.on(EV_HEARTBEAT)
async def on_user_heartbeat(sid: str) -> None:
    """心跳续期（防止僵尸连接）。"""
    user = await _get_user(sid)
    cid = (user or {}).get("cid")
    if not cid:
        return
    await _touch_online(str(cid))


@sio.on(EV_JOIN)
async def on_event_join(sid: str, event_id: Any = None) -> None:
    """加入活动房间，并通知房间内其他人（不含自己，对齐 Node `socket.to(room)`）。"""
    room = f"event:{_js_str(event_id)}"
    await sio.enter_room(sid, room)
    await sio.emit(EV_USER_JOINED, {"socketId": sid}, room=room, skip_sid=sid)


@sio.on(EV_LEAVE)
async def on_event_leave(sid: str, event_id: Any = None) -> None:
    room = f"event:{_js_str(event_id)}"
    await sio.leave_room(sid, room)


@sio.on(EV_MESSAGE)
async def on_event_message(sid: str, data: Any = None) -> None:
    """活动实时消息：仅登录用户可发，文本截断 500 字，广播给房间内所有人（含自己）。"""
    user = await _get_user(sid)
    if not user:
        return
    payload = data if isinstance(data, dict) else {}
    raw_text = _js_or(payload.get("text"), "")
    text_value = str(raw_text)[:500]
    room = f"event:{_js_str(payload.get('eventId'))}"
    await sio.emit(
        EV_MESSAGE,
        {
            "socketId": sid,
            "username": user.get("username"),
            "text": text_value,
            "time": _zh_cn_locale_string(),
        },
        room=room,
    )


# ---------------------------------------------------------------- 生命周期（可选）
async def online_cleanup_loop(interval_seconds: float = ONLINE_CLEANUP_INTERVAL_SECONDS) -> None:
    """60s 清理 + 广播（由 `app/jobs/scheduler.py` 托管）。"""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await cleanup_online_users()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("[OnlineUser] 清理异常: %s", exc)


__all__ = [
    "sio",
    "socket_app",
    "get_sio",
    "set_sio",
    "ONLINE_CLEANUP_INTERVAL_SECONDS",
    "online_count",
    "online_list",
    "broadcast_online",
    "cleanup_online_users",
    "track_socket_user_ip",
    "online_cleanup_loop",
    "EV_ONLINE",
    "EV_HEARTBEAT",
    "EV_JOIN",
    "EV_LEAVE",
    "EV_MESSAGE",
    "EV_USER_JOINED",
    "EV_ONLINE_COUNT",
    "EV_ONLINE_LIST",
    "EV_FSD_UPDATE",
]
