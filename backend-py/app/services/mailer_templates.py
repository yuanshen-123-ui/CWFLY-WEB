"""邮件模板补丁（补齐 app/services/mailer.py 未覆盖的两个模板）。

`admin` 路由需要 Node `src/utils/mailer.js` 里的：
- `sendReviewResult`      → 申请审核结果（职员/管制）
- `sendInterviewInvite`   → 面试邀请
以及带 `note` 的通用通知（`sendNotification` 的 note 字段）。

底层发送复用 `app.services.mailer._smtp_send`（同一个 SMTP 配置，
未配置 SMTP 时与 Node 的「开发模式」一致：静默跳过、不阻塞业务）。
所有失败都由调用方 `try/except` 吞掉，与 Node `sendNotification(...).catch(() => {})` 一致。
"""
from __future__ import annotations

import re
from typing import Any

from app.config import settings
from app.services import mailer

_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
}


def escape_html(value: Any) -> str:
    """对齐 Node `escapeHtml`（注意单引号转成 `&#39;`）。"""
    return re.sub(r"[&<>\"']", lambda m: _ESCAPE_MAP[m.group(0)], str(value if value is not None else ""))


def escape_html_admin(value: Any) -> str:
    """对齐 admin.js 内的 `escapeHtml`（单引号转成 `&#039;`）。"""
    if not value:
        return ""
    mapping = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}
    return re.sub(r"[&<>\"']", lambda m: mapping[m.group(0)], str(value))


def safe_url(url: Any) -> str:
    """对齐 Node `safeUrl`：仅放行 cwflysim.cn 的 https 链接。"""
    value = str(url if url is not None else "")
    if re.match(r"^https://([a-z0-9-]+\.)?cwflysim\.cn(/|$)", value, re.IGNORECASE):
        return value
    return "#"


def build_html(
    *,
    title: str = "",
    greeting: str = "您好",
    intro: str = "",
    body: str = "",
    action: str = "",
    action_url: str = "",
    note: str = "",
) -> str:
    """对齐 Node `buildHtml`（同一套品牌样式）。"""
    from_name = escape_html(settings.SMTP_FROM_NAME)
    parts = [
        '<div style="max-width:600px;margin:0 auto;font-family:\'Segoe UI\',sans-serif;">',
        '<div style="background:#1a73e8;padding:20px;text-align:center;border-radius:10px 10px 0 0;">',
        f'<h1 style="color:#fff;margin:0;font-size:20px;">{from_name}</h1>',
        "</div>",
        '<div style="padding:30px;border:1px solid #e2e6ed;border-top:0;border-radius:0 0 10px 10px;">',
        f'<p style="font-size:15px;color:#1f2a3a;">{escape_html(greeting)}，</p>',
    ]
    if intro:
        parts.append(f'<p style="font-size:15px;color:#1f2a3a;">{escape_html(intro)}</p>')
    if body:
        parts.append(f'<p style="font-size:14px;color:#1f2a3a;line-height:1.7;">{escape_html(body)}</p>')
    if action and action_url:
        target = safe_url(action_url)
        parts.extend(
            [
                '<div style="text-align:center;margin:24px 0;">',
                f'<a href="{target}" style="display:inline-block;padding:12px 28px;background:#1a73e8;'
                'color:#fff;font-size:15px;font-weight:600;border-radius:8px;text-decoration:none;">'
                f"{escape_html(action)}</a>",
                "</div>",
                '<p style="font-size:13px;color:#8e96a4;">如果按钮无法点击，请复制以下链接到浏览器：<br>'
                f'<span style="color:#1a73e8;">{target}</span></p>',
            ]
        )
    if note:
        parts.append(f'<p style="font-size:13px;color:#8e96a4;">{escape_html(note)}</p>')
    parts.extend(
        [
            '<hr style="border:none;border-top:1px solid #f0f2f5;margin:24px 0;">',
            '<p style="font-size:12px;color:#8e96a4;text-align:center;">&copy; 2026 CW 模拟飞行连飞平台</p>',
            "</div>",
            "</div>",
        ]
    )
    return "".join(parts)


async def send_notification_ex(to: str, payload: dict[str, Any]) -> None:
    """`sendNotification` 的完整版（保留 greeting / note）。"""
    subject = str(payload.get("subject") or "通知")
    html = build_html(
        title=subject,
        greeting=payload.get("greeting") or "您好",
        intro=payload.get("intro") or "",
        body=payload.get("body") or "",
        action=payload.get("action") or "",
        action_url=payload.get("actionUrl") or "",
        note=payload.get("note") or "",
    )
    await mailer._smtp_send(to, f"[CW 模拟飞行] {subject}", html, subject)


async def send_review_result(to: str, payload: dict[str, Any]) -> None:
    """对齐 Node `sendReviewResult`。"""
    application_type = str(payload.get("applicationType") or "")
    result = str(payload.get("result") or "")
    reason = payload.get("reason") or ""
    detail = payload.get("detail") or ""
    html = build_html(
        title=f"{application_type} - {result}",
        # Node 先拼出带 <strong> 的 intro，再由 buildHtml 统一 escape（标签会变实体，保持一致）
        intro=f"您提交的 <strong>{application_type}</strong> 申请已{result}。",
        body=detail,
        note=f"审核意见：{reason}" if reason else "",
    )
    await mailer._smtp_send(to, f"[CW 模拟飞行] {application_type} - {result}", html, application_type)


async def send_interview_invite(to: str, payload: dict[str, Any]) -> None:
    """对齐 Node `sendInterviewInvite`。"""
    application_type = str(payload.get("applicationType") or "")
    reason = payload.get("reason") or ""
    detail = payload.get("detail") or ""
    html = build_html(
        title=f"{application_type} - 面试邀请",
        intro=(
            f"您提交的 <strong>{application_type}</strong> 申请已通过初审，"
            "请从以下面试时间中选择合适的时间参加面试。"
        ),
        body=detail,
        note=f"备注：{reason}" if reason else "请提前做好面试准备。",
    )
    await mailer._smtp_send(to, f"[CW 模拟飞行] {application_type} - 面试邀请", html, application_type)


__all__ = [
    "escape_html",
    "escape_html_admin",
    "safe_url",
    "build_html",
    "send_notification_ex",
    "send_review_result",
    "send_interview_invite",
]
