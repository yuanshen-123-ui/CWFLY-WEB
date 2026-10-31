"""JWT 时段密钥轮换（逐行移植 Node src/services/keyRotation.js）。

- 每 24 小时轮换：period = floor((now - 2024-01-01T00:00:00Z) / 24h)
- 派生：HMAC-SHA256(JWT_SECRET, f"jwt-period-{period}").hexdigest()
- 验证窗口：当前 + 过去 7 个周期（共 8 个密钥）

⚠️ 必须与 Node 版本算法逐字节一致，否则双跑期间两侧签发的 token 互不承认。
"""
from __future__ import annotations

import hashlib
import hmac
import time

from app.config import settings

ROTATION_HOURS = 24
VERIFY_WINDOW = 7
_EPOCH_MS = 1704067200000  # 2024-01-01T00:00:00Z


def get_current_period(now_ms: int | None = None) -> int:
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    return (now - _EPOCH_MS) // (ROTATION_HOURS * 3600 * 1000)


def derive_period_key(period: int) -> str:
    return hmac.new(
        settings.JWT_SECRET.encode("utf-8"),
        f"jwt-period-{period}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def get_signing_key() -> str:
    """当前时段签名密钥（多进程/多实例结果一致）。"""
    return derive_period_key(get_current_period())


def get_verifying_keys() -> list[str]:
    """当前 + 过去 7 个周期的密钥（保证轮换后旧 token 仍可验证）。"""
    current = get_current_period()
    return [derive_period_key(current - i) for i in range(VERIFY_WINDOW)]


__all__ = ["get_signing_key", "get_verifying_keys", "get_current_period", "derive_period_key"]
