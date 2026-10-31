"""JSON 序列化：与 Node `res.json()`（JSON.stringify）保持一致。

关键差异点：
- JS `Date.toISOString()` → `2026-10-31T01:55:23.000Z`（毫秒 + Z）
- Python 默认 datetime.isoformat() → `2026-10-31T01:55:23+00:00`（不兼容，前端会解析失败）
- 中文/emoji 不转义（ensure_ascii=False）
- Decimal → 字符串（对齐 Prisma Decimal 的 JSON 序列化）
"""
from __future__ import annotations

import datetime as dt
import decimal
import json
from typing import Any

from fastapi.responses import JSONResponse
from starlette.background import BackgroundTask


def js_iso(value: dt.datetime) -> str:
    """复刻 JS Date.prototype.toISOString()。"""
    if value.tzinfo is not None:
        value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
    # 毫秒精度 + Z
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def js_default(obj: Any) -> Any:
    if isinstance(obj, dt.datetime):
        return js_iso(obj)
    if isinstance(obj, dt.date):
        return obj.strftime("%Y-%m-%d")
    if isinstance(obj, dt.time):
        return obj.strftime("%H:%M:%S")
    if isinstance(obj, decimal.Decimal):
        return str(obj)
    if isinstance(obj, (set, frozenset)):
        return list(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", "replace")
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


class JSJSONResponse(JSONResponse):
    """JSONResponse，但 datetime 输出成 JS 风格的 UTC ISO 字符串。"""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:  # type: ignore[override]
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
            default=js_default,
        ).encode("utf-8")


def js_jsonable(content: Any) -> Any:
    """把 datetime 递归转成 JS ISO 字符串（用于复用 Starlette 默认响应时）。"""
    if isinstance(content, dict):
        return {k: js_jsonable(v) for k, v in content.items()}
    if isinstance(content, (list, tuple, set)):
        return [js_jsonable(v) for v in content]
    if isinstance(content, dt.datetime):
        return js_iso(content)
    if isinstance(content, dt.date):
        return content.strftime("%Y-%m-%d")
    if isinstance(content, decimal.Decimal):
        return str(content)
    return content


__all__ = ["JSJSONResponse", "js_iso", "js_default", "js_jsonable", "BackgroundTask"]
