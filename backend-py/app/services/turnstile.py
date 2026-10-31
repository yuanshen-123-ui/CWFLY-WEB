"""Cloudflare Turnstile 服务端强校验（fail-closed，逐行对齐 Node src/utils/turnstile.js）。

规则（与环境无关，统一走 siteverify）：
1. token 缺失                     → 400「请完成人机验证」
2. 配置了 TURNSTILE_SECRET_KEY    → 用真实 secret 校验
3. 未配置 secret 且非 production  → 回退 Cloudflare 官方测试 secret
4. 未配置 secret 且 production    → 503 fail-closed
"""
from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import settings

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA"


@dataclass
class TurnstileResult:
    ok: bool
    status: int = 200
    message: str = ""

    def as_tuple(self) -> tuple[bool, int, str]:
        return self.ok, self.status, self.message


async def verify_turnstile(token: str | None, client_ip: str) -> TurnstileResult:
    if not token or not isinstance(token, str):
        return TurnstileResult(False, 400, "请完成人机验证")

    secret = settings.TURNSTILE_SECRET_KEY
    if not secret:
        if settings.is_prod:
            return TurnstileResult(False, 503, "人机验证服务未配置，请联系管理员")
        secret = TURNSTILE_TEST_SECRET

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                TURNSTILE_VERIFY_URL,
                json={"secret": secret, "response": token, "remoteip": client_ip},
            )
            data = resp.json()
        if not data.get("success"):
            return TurnstileResult(False, 403, "人机验证失败，请重试")
        return TurnstileResult(True)
    except Exception:
        # 网络异常同样 fail-closed
        return TurnstileResult(False, 502, "人机验证服务暂不可用，请稍后重试")


__all__ = ["TurnstileResult", "verify_turnstile"]
