"""Node/JS 语义兼容的微小工具（数值转换 / 请求体读取 / 字符串归一）。

端口对齐点：
- ``Number(x)``            → :func:`js_number`（NaN 抛 ``ValueError``，对应 Node 里
  ``Number(req.params.id)`` 得到 NaN 后 Prisma 抛校验错误 → 路由 catch → 500「操作失败」）
- ``Number(x) || d``       → :func:`js_number_or`
- ``Number.parseInt(x,10)``→ :func:`js_parse_int`（"12abc" → 12，"abc" → default）
- ``String(x || '')``      → :func:`js_param_string`
- ``req.body``（express）  → :func:`read_json_body`（非对象一律 {}，等价于解构出 undefined）
- ``{ contains: q }``      → :func:`js_contains_pattern`（Prisma 不做 LIKE 转义，这里同样不转义）
"""
from __future__ import annotations

import re
from typing import Any

from fastapi import Request

_INT_RE = re.compile(r"[+-]?\d+")
_HEX_RE = re.compile(r"0[xX][0-9a-fA-F]+")
_FLOAT_RE = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")


def js_number(value: Any) -> float | int:
    """对齐 JS ``Number(value)``；结果为 NaN（JS 里会让 Prisma 抛错）时抛 ValueError。"""
    if value is None:
        raise ValueError("NaN")
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return value
    s = str(value).strip()
    if s == "":
        return 0  # Number("") === 0
    if _INT_RE.fullmatch(s):
        return int(s)
    if _HEX_RE.fullmatch(s):
        return int(s, 16)
    if _FLOAT_RE.fullmatch(s):
        f = float(s)
        return int(f) if f.is_integer() else f
    if s in ("Infinity", "+Infinity"):
        return float("inf")
    if s == "-Infinity":
        return float("-inf")
    raise ValueError(f"NaN: {value!r}")


def js_int(value: Any) -> int:
    """``Number(x)`` 且要求整数值（Prisma Int 校验）；不满足抛 ValueError。"""
    n = js_number(value)
    if isinstance(n, float):
        if not n.is_integer():
            raise ValueError(f"not an Int: {value!r}")
        return int(n)
    return int(n)


def js_number_or(value: Any, default: int = 0) -> int:
    """对齐 ``Number(value) || default``（NaN / 0 → default）。"""
    try:
        n = js_number(value)
    except ValueError:
        return default
    if isinstance(n, float):
        if not n.is_integer():
            return default
        n = int(n)
    return n or default


def js_skip(value: Any, size: int = 20, default_page: int = 1) -> int:
    """对齐 Prisma ``skip: (Number(page) - 1) * size``（非整数 skip 会让 Prisma 抛错）。"""
    n = default_page if value is None else js_number(value)
    raw = (n - 1) * size
    if isinstance(raw, float):
        if not raw.is_integer():
            raise ValueError(f"skip is not an Int: {raw!r}")
        raw = int(raw)
    return int(raw)


def js_parse_int(value: Any, default: int = 0) -> int:
    """对齐 ``Number.parseInt(v, 10)``，非有限结果回退 default。"""
    if value is None or isinstance(value, bool):
        return default
    m = _INT_RE.match(str(value).strip())
    if not m:
        return default
    try:
        return int(m.group(0))
    except ValueError:  # pragma: no cover - 正则已保证可解析
        return default


def js_param_string(value: Any) -> str:
    """对齐 ``String(value || '')``。"""
    if value is None:
        return ""
    return str(value)


def js_callsign(value: Any) -> str:
    """对齐 ``String(x || '').trim().toUpperCase().slice(0, 16)``。"""
    return js_param_string(value).strip().upper()[:16]


def js_contains_pattern(value: Any, case: str | None = None) -> str:
    """Prisma ``{ contains: q }`` → ``LIKE '%q%'`` 的绑定参数（不做转义，与 Prisma 一致）。"""
    s = js_param_string(value)
    if case == "upper":
        s = s.upper()
    return f"%{s}%"


async def read_json_body(request: Request) -> dict[str, Any]:
    """读取 JSON 请求体；解析失败或非对象时返回 {}（等价 Node 解构出 undefined）。"""
    try:
        raw = await request.json()
    except Exception:  # noqa: BLE001 - 空 body / 非法 JSON
        return {}
    return raw if isinstance(raw, dict) else {}


__all__ = [
    "js_number",
    "js_int",
    "js_number_or",
    "js_skip",
    "js_parse_int",
    "js_param_string",
    "js_callsign",
    "js_contains_pattern",
    "read_json_body",
]
