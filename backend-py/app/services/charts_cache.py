"""charts 路由的模块级缓存与纯计算辅助（对齐 Node src/routes/charts.js 的内存行为）。

- Navigraph access token 缓存：模块级 dict + 毫秒时间戳（Node: `cachedToken` / `tokenExpiry`）
- 机场坐标后备字典 / 大圆距离 / SimBrief route 解析：Node 同文件内的纯函数
无外部请求、无数据库访问。
"""
from __future__ import annotations

import math
import re
import time
from typing import Any, Optional

# ===== Navigraph access token 缓存（进程内，模块级 dict + 时间戳）=====
_CACHE: dict[str, Any] = {"token": None, "expiry_ms": 0}


def now_ms() -> int:
    """对齐 JS `Date.now()`（毫秒）。"""
    return int(time.time() * 1000)


def get_valid_token() -> Optional[str]:
    """对齐 `if (cachedToken && Date.now() < tokenExpiry) return cachedToken`。"""
    token = _CACHE.get("token")
    if token and now_ms() < int(_CACHE.get("expiry_ms") or 0):
        return str(token)
    return None


def peek_token() -> Optional[str]:
    """不看有效期，直接取缓存里的 token（Node `/proxy` 用的就是 `cachedToken` 变量）。"""
    token = _CACHE.get("token")
    return str(token) if token else None


def store_token(token: str, expires_in: Any) -> str:
    """对齐 `tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000`。"""
    try:
        seconds = float(expires_in or 3600)
    except (TypeError, ValueError):
        seconds = 3600.0
    if seconds == 0:
        seconds = 3600.0
    _CACHE["token"] = token
    _CACHE["expiry_ms"] = now_ms() + int(seconds * 1000) - 60000
    return token


def reset() -> None:
    """清空缓存（测试/排障用，Node 版没有对应接口）。"""
    _CACHE["token"] = None
    _CACHE["expiry_ms"] = 0


# ===== 常用机场坐标后备字典（覆盖国内主要机场，与 Node 逐条一致）=====
AIRPORT_COORDS: dict[str, dict[str, float]] = {
    "ZSSS": {"lat": 31.1979, "lon": 121.3363},
    "ZSPD": {"lat": 31.1434, "lon": 121.8053},
    "ZBAA": {"lat": 40.0799, "lon": 116.6031},
    "ZBAD": {"lat": 39.5098, "lon": 116.4105},
    "ZGGG": {"lat": 23.3925, "lon": 113.2988},
    "ZGSZ": {"lat": 22.6394, "lon": 113.8142},
    "ZGHA": {"lat": 28.1892, "lon": 113.2200},
    "ZGNN": {"lat": 22.6083, "lon": 108.1725},
    "ZUCK": {"lat": 29.7192, "lon": 106.6417},
    "ZUUU": {"lat": 30.5786, "lon": 103.9469},
    "ZPPP": {"lat": 25.1019, "lon": 102.9292},
    "ZPLJ": {"lat": 26.6792, "lon": 100.2461},
    "ZSHC": {"lat": 30.2295, "lon": 120.4344},
    "ZSNB": {"lat": 29.8267, "lon": 121.4619},
    "ZSNJ": {"lat": 31.7420, "lon": 118.8620},
    "ZSOF": {"lat": 31.9889, "lon": 116.9789},
    "ZSAM": {"lat": 24.5439, "lon": 118.1275},
    "ZSFZ": {"lat": 25.9333, "lon": 119.6667},
    "ZGSD": {"lat": 22.0069, "lon": 113.3747},
    "ZGHK": {"lat": 19.7933, "lon": 110.4525},
    "ZJHK": {"lat": 19.9349, "lon": 110.4590},
    "ZJSY": {"lat": 18.3029, "lon": 109.4122},
    "ZWWW": {"lat": 43.9072, "lon": 87.4742},
    "ZWSH": {"lat": 39.5433, "lon": 76.0200},
    "ZLXY": {"lat": 34.4471, "lon": 108.7516},
    "ZLLL": {"lat": 36.5152, "lon": 103.6200},
    "ZYHB": {"lat": 45.6234, "lon": 126.2503},
    "ZYCC": {"lat": 43.9959, "lon": 125.6850},
    "ZYTL": {"lat": 38.9657, "lon": 121.5386},
    "ZYTX": {"lat": 41.6401, "lon": 123.4834},
    "ZBTJ": {"lat": 39.1244, "lon": 117.3462},
    "ZBNY": {"lat": 40.0732, "lon": 116.6416},
    "ZBHH": {"lat": 40.8500, "lon": 111.8233},
    "ZBDT": {"lat": 40.0603, "lon": 113.4823},
    "ZHHH": {"lat": 30.7838, "lon": 114.2081},
    "ZUGY": {"lat": 26.5383, "lon": 106.8014},
    "ZUKJ": {"lat": 26.3222, "lon": 109.4450},
    "ZPKM": {"lat": 25.2167, "lon": 102.7417},
    "ZPDQ": {"lat": 27.7936, "lon": 99.6772},
    "ZWYN": {"lat": 39.2333, "lon": 75.2333},
    "ZWAK": {"lat": 41.2633, "lon": 80.2572},
    "ZSQD": {"lat": 36.2661, "lon": 120.3744},
    "ZSJN": {"lat": 36.8572, "lon": 117.2161},
    "RCTP": {"lat": 25.0764, "lon": 121.2239},
    "RCSS": {"lat": 25.0697, "lon": 121.5525},
    "VHHH": {"lat": 22.3080, "lon": 113.9185},
    "VMMC": {"lat": 22.1495, "lon": 113.5914},
    "RJTT": {"lat": 35.5494, "lon": 139.7798},
    "RJBB": {"lat": 34.4320, "lon": 135.2304},
    "RKSI": {"lat": 37.4602, "lon": 126.4407},
    "RKSS": {"lat": 37.5583, "lon": 126.7906},
}

EARTH_RADIUS_NM = 3440.065  # 地球半径（海里）

_SIMBRIEF_SPLIT = re.compile(r"[\r\n]+")


def js_round(value: float) -> int:
    """对齐 JS `Math.round()`（.5 向上取整，正数场景）。"""
    return int(math.floor(value + 0.5))


def great_circle_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Haversine 大圆距离，返回海里整数（与 Node `Math.round(R * c)` 一致）。"""
    to_rad = lambda d: float(d) * math.pi / 180.0  # noqa: E731
    d_lat = to_rad(float(lat2) - float(lat1))
    d_lon = to_rad(float(lon2) - float(lon1))
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return js_round(EARTH_RADIUS_NM * c)


def parse_simbrief_route(route_str: Any) -> Optional[dict[str, str]]:
    """解析 SimBrief 格式 route 字符串为字段对象（对齐 Node `parseSimbriefRoute`）。"""
    if not isinstance(route_str, str) or not route_str:
        return None
    if "[SBFlightPlan]" not in route_str and "Departure=" not in route_str:
        return None
    fields: dict[str, str] = {}
    for line in _SIMBRIEF_SPLIT.split(route_str):
        idx = line.find("=")
        if idx > 0:
            fields[line[:idx].strip()] = line[idx + 1 :].strip()
    return fields


def truthy(value: Any) -> bool:
    """JS 真值语义（空数组/空对象为真，0/''/null/false 为假）。"""
    if value is None or value is False:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value != ""
    return True


def js_or(*values: Any) -> Any:
    """对齐 JS `a || b || c`（无真值时返回空串）。"""
    for value in values:
        if truthy(value):
            return value
    return ""


__all__ = [
    "AIRPORT_COORDS",
    "EARTH_RADIUS_NM",
    "now_ms",
    "get_valid_token",
    "peek_token",
    "store_token",
    "reset",
    "js_round",
    "great_circle_distance",
    "parse_simbrief_route",
    "truthy",
    "js_or",
]
