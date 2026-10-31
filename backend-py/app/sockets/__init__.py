"""Socket.IO 实时通道包。

对外导出：
    sio         python-socketio `AsyncServer` 实例（`app/asgi.py` 使用）
    socket_app  `ASGIApp` 包装（path = /socket.io，供 `app.mount` 或独立部署使用）
    get_sio     fsd_tracker 等模块广播时取当前实例

推荐接线（Lead 已在 app/asgi.py 完成）：
    socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="/socket.io")
"""
from __future__ import annotations

from app.sockets.server import (
    EV_FSD_UPDATE,
    EV_HEARTBEAT,
    EV_JOIN,
    EV_LEAVE,
    EV_MESSAGE,
    EV_ONLINE,
    EV_ONLINE_COUNT,
    EV_ONLINE_LIST,
    EV_USER_JOINED,
    ONLINE_CLEANUP_INTERVAL_SECONDS,
    broadcast_online,
    cleanup_online_users,
    get_sio,
    online_cleanup_loop,
    online_count,
    online_list,
    set_sio,
    sio,
    socket_app,
    track_socket_user_ip,
)

__all__ = [
    "sio",
    "socket_app",
    "get_sio",
    "set_sio",
    "EV_ONLINE",
    "EV_HEARTBEAT",
    "EV_JOIN",
    "EV_LEAVE",
    "EV_MESSAGE",
    "EV_USER_JOINED",
    "EV_ONLINE_COUNT",
    "EV_ONLINE_LIST",
    "EV_FSD_UPDATE",
    "ONLINE_CLEANUP_INTERVAL_SECONDS",
    "online_count",
    "online_list",
    "broadcast_online",
    "cleanup_online_users",
    "online_cleanup_loop",
    "track_socket_user_ip",
]
