"""设备指纹密码学层（移植 Node `src/services/deviceFp.js` 的 L1 签名 + L4 PoW）。

Node 版原样：服务端签发随机 `fp` 并用 HMAC 签名（绑定 fp + UA + 签发时间），客户端回传
`X-Device-Fp / X-Device-Sig / X-Device-Issued`，服务端验签；外加无状态 hashcash PoW。

⚠️ 与 Node 的重要事实（已在交付报告注明）：
Node `src/services/deviceFp.js` 第 16 行 `import { getDeviceSecret } from '../config/index.js'`，
但 `src/config/index.js` **从未导出** `getDeviceSecret` —— 该模块在 Node 里一 import 就会抛
`SyntaxError: does not provide an export named 'getDeviceSecret'`，且全仓库没有任何路由 import
它（死代码）。因此本移植是「按注释与调用意图还原」，并非逐字节兼容某个线上行为。
密钥取值：优先 `DEVICE_SECRET`，否则回退 `JWT_SECRET`（两者都没有时抛清晰错误）。

归属：实时通道 + 定时任务 + 共享服务层。设备封禁存储层在 `app/services/device_fp.py`
（他人负责，本文件不与其重名冲突）。
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from typing import Any, Dict, Optional

from app.services.env_compat import env_int, env_str
from app.utils.client import get_device_fp

# 指纹签名有效期（默认 7 天）
FP_SIG_TTL_MS = env_int("FP_SIG_TTL_MS", 7 * 24 * 3600) * 1000
# PoW 难度（前 N bit 为 0，默认 14）
POW_DIFFICULTY = env_int("POW_DIFFICULTY", 14)
# PoW 挑战有效期（默认 5 分钟）
POW_TTL_MS = env_int("POW_TTL_MS", 5 * 60) * 1000

_CLOCK_SKEW_MS = 5 * 60 * 1000
_POW_FUTURE_SKEW_MS = 60 * 1000


def get_device_secret() -> str:
    """设备指纹 / PoW 的 HMAC 密钥（Node 这里调用的 `getDeviceSecret()` 实际不存在）。"""
    secret = env_str("DEVICE_SECRET", "") or env_str("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("DEVICE_SECRET / JWT_SECRET 均未配置，无法签发或校验设备指纹")
    return secret


def _now_ms(now: Optional[float] = None) -> float:
    return now if now is not None else time.time() * 1000


# ------------------------------------------------------------------ 指纹签发/验签
def issue_fp() -> str:
    """生成服务端指纹 `fp-<32hex>`（客户端不再自造）。"""
    return "fp-" + secrets.token_hex(16)


def sign_fp(fp: str, ua: str, issued_at: Any) -> str:
    """HMAC-SHA256(secret, `fp|ua|issuedAt`) 的十六进制摘要。"""
    message = f"{fp}|{ua}|{issued_at}".encode("utf-8")
    return hmac.new(get_device_secret().encode("utf-8"), message, hashlib.sha256).hexdigest()


def parse_device(request: Any) -> Dict[str, Any]:
    """从请求解析设备凭证（软解析，不抛错）。

    :param request: Starlette/FastAPI `Request`
    :return: {"fp": str, "sig": str, "issued": int}
    """
    header_fp = (request.headers.get("x-device-fp") or "").strip()
    fp = header_fp or (get_device_fp(request) or "")
    sig = (request.headers.get("x-device-sig") or "").strip()
    issued_raw = (request.headers.get("x-device-issued") or "0").strip()
    try:
        issued = int(float(issued_raw or 0))
    except (TypeError, ValueError):
        issued = 0
    return {"fp": fp, "sig": sig, "issued": issued}


def safe_equal(a: Any, b: Any) -> bool:
    """常量时间比较（防时序攻击）。"""
    if not isinstance(a, str) or not isinstance(b, str) or len(a) != len(b):
        return False
    return hmac.compare_digest(a, b)


def is_device_sig_valid(device: Optional[Dict[str, Any]], ua: str, now: Optional[float] = None) -> bool:
    """签名是否有效（未篡改且未过期）。"""
    device = device or {}
    fp = device.get("fp") or ""
    sig = device.get("sig") or ""
    issued = device.get("issued") or 0
    if not fp or not sig or not issued:
        return False
    current = _now_ms(now)
    if current - issued > FP_SIG_TTL_MS or issued > current + _CLOCK_SKEW_MS:
        return False
    return safe_equal(sign_fp(fp, ua, issued), sig)


# ------------------------------------------------------------------ Proof-of-Work
def create_pow_challenge() -> Dict[str, Any]:
    """生成 PoW 挑战 `{challenge, difficulty, sig}`（无共享状态，可跨实例校验）。"""
    nonce = secrets.token_hex(16)
    issued = int(_now_ms())
    challenge = f"{nonce}.{issued}"
    sig = hmac.new(
        get_device_secret().encode("utf-8"), f"pow:{challenge}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return {"challenge": challenge, "difficulty": POW_DIFFICULTY, "sig": sig}


def verify_pow(
    challenge: str,
    nonce: str,
    difficulty: Any,
    sig: str,
    now: Optional[float] = None,
) -> bool:
    """校验 PoW 解：签名有效 + 未过期 + `sha256(challenge|nonce)` 前 difficulty bit 为 0。"""
    if not challenge or not nonce or not sig:
        return False
    if not isinstance(difficulty, int) or isinstance(difficulty, bool) or difficulty < 1 or difficulty > 32:
        return False
    current = _now_ms(now)
    expected = hmac.new(
        get_device_secret().encode("utf-8"), f"pow:{challenge}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not safe_equal(expected, sig):
        return False
    try:
        issued = int(str(challenge).split(".")[-1] or 0)
    except (TypeError, ValueError):
        issued = 0
    if not issued or current - issued > POW_TTL_MS or issued > current + _POW_FUTURE_SKEW_MS:
        return False

    digest = hashlib.sha256(f"{challenge}|{nonce}".encode("utf-8")).hexdigest()
    full_chars = difficulty // 4
    if not digest.startswith("0" * full_chars):
        return False
    rem_bits = difficulty % 4
    if rem_bits > 0:
        nibble = int(digest[full_chars], 16)
        if nibble >> (4 - rem_bits) != 0:
            return False
    return True


__all__ = [
    "FP_SIG_TTL_MS",
    "POW_DIFFICULTY",
    "POW_TTL_MS",
    "get_device_secret",
    "issue_fp",
    "sign_fp",
    "parse_device",
    "safe_equal",
    "is_device_sig_valid",
    "create_pow_challenge",
    "verify_pow",
]
