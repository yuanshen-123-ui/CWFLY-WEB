"""IP 跳变检测占位实现（P3 完整移植 Node src/services/ipHopping.js）。

Node 版在登录成功与每个已认证请求上调用 trackRequestIp，把 IP/CID/设备指纹写入
UserLoginIp / OnlineUser 等表并做跳变判定。该逻辑不影响认证响应，P0 阶段先 no-op，
避免在 auth 灰度期间产生双写噪音；P3 移植时在此文件内补齐即可。
"""
from __future__ import annotations

from starlette.requests import Request


def track_request_ip(request: Request, cid: str | None) -> None:
    """占位：P3 实现（写入 IP 轨迹 + 跳变判定）。"""
    return None


def track_socket_ip(socket_id: str, cid: str | None, ip: str | None) -> None:
    """占位：Socket.IO 上线上报（P3 一并移植）。"""
    return None


__all__ = ["track_request_ip", "track_socket_ip"]
