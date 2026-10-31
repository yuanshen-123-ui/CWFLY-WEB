"""客户端请求元数据（与 Node 版 src/utils/client.js 逻辑逐行对齐）。"""
from __future__ import annotations

from typing import Any

from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    """真实客户端 IP。

    信任链与 Node 完全一致：
    - 来自回环（nginx 反代）→ 信任 nginx 用 $remote_addr 覆盖注入的 X-Real-IP；
    - 直连（非回环）→ 用 TCP 对端地址（客户端无法伪造）；
    - 不信任客户端自带的 X-Forwarded-For 首段。
    """
    client = request.client
    remote = (client.host if client else "") or ""
    if remote.startswith("::ffff:"):
        remote = remote[len("::ffff:") :]
    xrip = (request.headers.get("x-real-ip") or "").strip()
    xff_raw = request.headers.get("x-forwarded-for") or ""
    xff = xff_raw.split(",")[-1].strip() if xff_raw else ""
    if remote in ("127.0.0.1", "::1"):
        return xrip or xff or remote
    return remote


def get_device_fp(request: Request) -> str:
    """设备指纹：X-Device-Fp 头 > query `_fp`（<img> 不能带自定义头）。"""
    from_header = (request.headers.get("x-device-fp") or "").strip()
    if from_header:
        return from_header
    q = request.query_params.get("_fp")
    return str(q).strip() if q else ""


def get_user_agent(request: Request) -> str:
    """User-Agent（截断 190，兼容 MySQL VARCHAR(191)）。"""
    return (request.headers.get("user-agent") or "")[:190]


def get_referrer(request: Request) -> str:
    return (request.headers.get("referer") or request.headers.get("referrer") or "")[:500]


def get_user_id(request: Request) -> str:
    """登录用户 CID：优先 query `_uid`，否则取认证后的 JWT。"""
    q = request.query_params.get("_uid")
    if q:
        return str(q).strip()
    user: Any = getattr(request.state, "user", None)
    if isinstance(user, dict):
        return str(user.get("cid") or "")
    return ""


def get_cookies(request: Request) -> str:
    return (request.headers.get("cookie") or "")[:500]


__all__ = [
    "get_client_ip",
    "get_device_fp",
    "get_user_agent",
    "get_referrer",
    "get_user_id",
    "get_cookies",
]
