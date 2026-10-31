"""FSD 飞行计划报文的规范化/拼装（逐行移植 Node `src/services/fsdFlightPlan.js`）。

输出必须是 fsd-py 的 `$FP` 解析格式（parts[0]=callsign），否则管制/机组看不到计划。
"""
from __future__ import annotations

import re
from typing import Any, Dict

_PARSE_INT_RE = re.compile(r"^\s*([+-]?\d+)")


def _js_parse_int(value: Any) -> int:
    """`Number.parseInt(x, 10)`：从头解析整数，无法解析返回 NaN（这里用 None）。"""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value == value and abs(value) != float("inf") else 0
    match = _PARSE_INT_RE.match(str(value if value is not None else ""))
    return int(match.group(1)) if match else 0


def _js_string(value: Any) -> str:
    """`String(x || '')` 的常用形态（None/空 → 空串）。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _js_or(value: Any, default: Any) -> Any:
    """`value || default`（falsy：None / '' / 0 / False）。"""
    if value is None or value == "" or value is False or value == 0:
        return default
    return value


def _split_pair(value: Any) -> tuple[str, str]:
    """`String(x || '').split(':')[0] || '0'` 与 `[1] || '0'`。"""
    parts = _js_string(value).split(":")
    head = parts[0] if len(parts) > 0 else ""
    tail = parts[1] if len(parts) > 1 else ""
    return (head or "0", tail or "0")


def normalize_fsd_flight_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    p = plan or {}
    flight_type = "V" if p.get("flightType") == "VFR" else "I"
    tas = _js_parse_int(p.get("cruiseSpeed")) or 450
    dep_time_raw = p.get("depTime")
    dep_time = re.sub(r"[^0-9]", "", _js_string(dep_time_raw)) if dep_time_raw else ""
    alt = _js_or(p.get("cruiseAlt"), "35000")
    hrs_enroute, min_enroute = _split_pair(p.get("flightTime"))
    hrs_fuel, min_fuel = _split_pair(p.get("endurance"))

    return {
        "flightType": flight_type,
        "tas": tas,
        "depTime": dep_time,
        "alt": alt,
        "hrsEnroute": hrs_enroute,
        "minEnroute": min_enroute,
        "hrsFuel": hrs_fuel,
        "minFuel": min_fuel,
        "depIcao": _js_string(p.get("depIcao")).upper(),
        "arrIcao": _js_string(p.get("arrIcao")).upper(),
        "alternate": _js_string(p.get("alternate")).upper(),
        "remarks": _js_string(p.get("remarks")),
        "route": _js_string(p.get("route")),
        "aircraft": _js_string(p.get("aircraft")),
        "callsign": _js_string(p.get("callsign")).upper(),
    }


def build_fsd_flight_plan_payload(plan: Dict[str, Any]) -> str:
    """`$FP` 冒号分隔报文主体（顺序与 Node 完全一致）。"""
    n = normalize_fsd_flight_plan(plan)
    parts = [
        n["callsign"],  # parts[0] = callsign（fsd-py 解析必需）
        "0",  # parts[1] = revision
        n["flightType"],
        n["aircraft"],
        str(n["tas"]),
        n["depIcao"],
        n["depTime"],
        "0",
        n["alt"],
        n["arrIcao"],
        n["hrsEnroute"],
        n["minEnroute"],
        n["hrsFuel"],
        n["minFuel"],
        n["alternate"],
        n["remarks"],
        n["route"],
    ]
    return ":".join(parts)


def build_fsd_flight_plan_message(plan: Dict[str, Any]) -> str:
    """完整报文（带 `$FP` 前缀与 CRLF 结尾）。"""
    return f"$FP{build_fsd_flight_plan_payload(plan)}\r\n"


__all__ = [
    "normalize_fsd_flight_plan",
    "build_fsd_flight_plan_payload",
    "build_fsd_flight_plan_message",
]
