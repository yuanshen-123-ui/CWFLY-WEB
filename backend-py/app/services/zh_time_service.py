"""zh-CN 本地时间字符串（对齐 Node ``new Date().toLocaleString('zh-CN')``）。

Node（ICU/CLDR）的 zh-CN 输出格式实测（node v24，Asia/Shanghai）：

    2026/11/2 14:05:09      ← 年/月/日 用 '/' 分隔，**月、日不补零**
    2026/1/5 08:00:00       ← 时/分/秒 **补零到两位**

落库位置（Prisma 里是 String 列）：
- ``Ticket.createdAt`` / ``Ticket.updatedAt``（tickets.js，hour12:false）
- ``Application.time``（apply.js）
- ``Feedback.time``（feedback.js）

注意：与 ``app/services/flightplans.py: zh_now_string()``（补零写法）不同，
本模块严格复刻 ICU 的「不补零」行为；Node 侧两个调用点（含 hour12:false）输出一致。
"""
from __future__ import annotations

import datetime as dt


def zh_locale(value: dt.datetime | None = None) -> str:
    """把本地时间格式化成 Node ``toLocaleString('zh-CN')`` 的字符串。"""
    d = value if value is not None else dt.datetime.now()
    return f"{d.year}/{d.month}/{d.day} {d.hour:02d}:{d.minute:02d}:{d.second:02d}"


def zh_now() -> str:
    """当前本地时间的 Node zh-CN 字符串。"""
    return zh_locale(dt.datetime.now())


__all__ = ["zh_locale", "zh_now"]
