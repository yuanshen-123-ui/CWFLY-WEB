"""ASGI 入口：FastAPI(HTTP) + python-socketio(Socket.IO)。

部署用：`uvicorn app.asgi:application --host 127.0.0.1 --port 3001`
（HTTP 行为与 `app.main:app` 完全一致；`/socket.io/` 由 Socket.IO 处理）
"""
from __future__ import annotations

import logging

from app.main import app as fastapi_app

log = logging.getLogger("cwfly.asgi")

application = fastapi_app

# Socket.IO 为可选项：sockets 模块未就绪时退化为纯 HTTP，不影响 API
try:
    import socketio  # type: ignore

    from app.sockets.server import sio  # type: ignore

    application = socketio.ASGIApp(  # type: ignore[assignment]
        sio, other_asgi_app=fastapi_app, socketio_path="/socket.io"
    )
    log.info("[CWFLY] Socket.IO 已挂载于 /socket.io/")
except Exception as exc:  # noqa: BLE001
    log.warning("[CWFLY] Socket.IO 未启用（%s），仅提供 HTTP", exc)


__all__ = ["application"]
