"""FSD 管理口（3012）通知：逐行移植 Node flightplans.js 的 notifyFsd。

协议（与 fsd-py 管理口一致）：
    pwd <FSD_MGMT_PASSWORD>\r\n
    planadd|plandel <CALLSIGN>\r\n
写入后 600ms 关闭连接；连接/超时 3s；任何异常返回 False（调用方忽略）。
"""
from __future__ import annotations

import asyncio
import logging
import os

log = logging.getLogger("cwfly.fsd_mgmt")

FSD_MGMT_HOST = os.getenv("FSD_MGMT_HOST", "127.0.0.1")
FSD_MGMT_PORT = int(os.getenv("FSD_MGMT_PORT", "3012"))
FSD_MGMT_PASSWORD = os.getenv("FSD_MGMT_PASSWORD", "")

CLOSE_AFTER_SECONDS = 0.6
CONNECT_TIMEOUT = 3.0


async def notify_fsd(action: str, callsign: str) -> bool:
    """action: 'add' | 'del'；成功写入返回 True。"""
    if not FSD_MGMT_PASSWORD:
        return False
    cmd = "plandel" if action == "del" else "planadd"
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(FSD_MGMT_HOST, FSD_MGMT_PORT), timeout=CONNECT_TIMEOUT
        )
    except Exception:
        return False
    try:
        writer.write(f"pwd {FSD_MGMT_PASSWORD}\r\n".encode())
        writer.write(f"{cmd} {callsign}\r\n".encode())
        await writer.drain()
        await asyncio.sleep(CLOSE_AFTER_SECONDS)
        return True
    except Exception:
        return False
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


__all__ = ["notify_fsd", "FSD_MGMT_HOST", "FSD_MGMT_PORT", "FSD_MGMT_PASSWORD"]
