"""邮件与验证码（对齐 Node src/utils/mailer.js 的关键行为）。

- 验证码：优先写 `VerificationCode` 表（多实例共享），DB 异常时降级到进程内 Map；
- 校验：一次性，通过即删；连续失败 5 次作废该邮箱验证码；
- 发送：aiosmtplib（异步 SMTP），邮件发送失败不影响主流程（Node 同样 catch 忽略）。
"""
from __future__ import annotations

import asyncio
import secrets
import time
from typing import Any

from aiosmtplib import send as smtp_send
from email.message import EmailMessage

from app.config import settings
from app.db.session import SessionLocal
from app.services import users

CODE_TTL_MS = 600_000  # 10 分钟
MAX_ATTEMPTS = 5

# 进程内降级存储（与 Node 的 codeStore 同构）
_code_store: dict[str, dict[str, Any]] = {}


def generate_code() -> str:
    """6 位数字验证码（对齐 Node crypto.randomInt(100000, 1000000)）。"""
    return str(secrets.randbelow(900000) + 100000)


async def store_code(email: str, code: str) -> None:
    try:
        async with SessionLocal() as db:
            await users.store_verification_code(db, email, code, CODE_TTL_MS)
    except Exception:
        _code_store[email] = {"code": code, "time": int(time.time() * 1000), "attempts": 0}


async def verify_code(email: str, code: str) -> bool:
    """校验并消费验证码。"""
    try:
        async with SessionLocal() as db:
            record = await users.find_verification_code(db, email, code)
            if record is None:
                cur = _code_store.setdefault(email, {"attempts": 0})
                cur["attempts"] = int(cur.get("attempts") or 0) + 1
                if cur["attempts"] >= MAX_ATTEMPTS:
                    await users.delete_verification_codes(db, email)
                    _code_store.pop(email, None)
                return False
            await users.delete_verification_code(db, int(record["id"]))
            _code_store.pop(email, None)
            return True
    except Exception:
        record = _code_store.get(email)
        if not record:
            return False
        if int(time.time() * 1000) - int(record["time"]) > CODE_TTL_MS:
            _code_store.pop(email, None)
            return False
        if record.get("code") != code:
            record["attempts"] = int(record.get("attempts") or 0) + 1
            if record["attempts"] >= MAX_ATTEMPTS:
                _code_store.pop(email, None)
            return False
        _code_store.pop(email, None)
        return True


async def _smtp_send(to: str, subject: str, html: str, text_body: str = "") -> None:
    if not settings.SMTP_HOST or not settings.SMTP_FROM_EMAIL:
        return
    message = EmailMessage()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text_body or "请使用支持 HTML 的客户端查看本邮件")
    message.add_alternative(html, subtype="html")
    await smtp_send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USERNAME or None,
        password=settings.SMTP_PASSWORD or None,
        use_tls=settings.SMTP_PORT == 465,
        start_tls=settings.SMTP_PORT == 587,
        timeout=20,
    )


async def send_verify_code(to: str, code: str, purpose: str = "验证") -> None:
    html = (
        f"<p>您的{purpose}验证码是：</p>"
        f"<p style='font-size:24px;font-weight:bold;letter-spacing:4px'>{code}</p>"
        f"<p>10 分钟内有效，请勿泄露给他人。</p>"
    )
    await _smtp_send(to, f"{settings.SMTP_FROM_NAME} {purpose}验证码", html, f"验证码：{code}")


def fire_and_forget(coro: Any) -> None:
    """Node 版 `sendNotification(...).catch(() => {})`：不阻塞响应、失败静默。"""
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        pass


async def send_notification(to: str, payload: dict[str, Any]) -> None:
    subject = payload.get("subject") or "通知"
    intro = payload.get("intro") or ""
    body = payload.get("body") or ""
    action = payload.get("action") or ""
    action_url = payload.get("actionUrl") or settings.FRONTEND_URL
    html = f"<p>{intro}</p><p>{body}</p>"
    if action:
        html += f"<p><a href='{action_url}'>{action}</a></p>"
    await _smtp_send(to, subject, html, f"{intro}\n{body}\n{action_url}")


async def send_security_alert(to: str, payload: dict[str, Any]) -> None:
    subject = f"安全提醒：{payload.get('action') or '账号操作'}"
    html = (
        f"<p>{payload.get('action') or ''}</p>"
        f"<p>{payload.get('detail') or ''}</p>"
        f"<p>时间：{payload.get('time') or ''}<br/>IP：{payload.get('ip') or ''}</p>"
    )
    await _smtp_send(to, subject, html, str(payload))


__all__ = [
    "generate_code",
    "store_code",
    "verify_code",
    "send_verify_code",
    "send_notification",
    "send_security_alert",
    "fire_and_forget",
]
