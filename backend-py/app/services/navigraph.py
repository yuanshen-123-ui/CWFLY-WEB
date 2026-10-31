"""航图外部数据源（Navigraph / 原始 ccflysim API）+ 机场坐标 / 代理白名单。

对应 Node `src/routes/charts.js` 内的 `getNavigraphToken / queryNavigraphCharts /
queryLegacyCharts / getAirportCoords / rewriteUrl / isProxyAllowed`。
超时秒数与 Node 的 `AbortSignal.timeout(ms)` 一致；token 缓存见 charts_cache。
"""
from __future__ import annotations

import logging
import os
import re
import urllib.parse
from pathlib import Path
from typing import Any, Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import charts_cache

log = logging.getLogger("cwfly.charts")

# ===== 外部端点（与 Node 完全一致）=====
NAVIGRAPH_TOKEN_URL = "https://identity.api.navigraph.com/connect/token"
NAVIGRAPH_CHARTS_API = "https://api.navigraph.com/v2/charts"
NAVIGRAPH_CLIENT_ID = "navigraph.web"
CFY_API = "https://www.ccflysim.cn:8443/api"

# 航路查询依次尝试的路径（Node: paths 数组）
ROUTE_PATHS = ("ruote", "route", "flight/route", "airway")

# 超时（秒）：Node AbortSignal.timeout(...) 毫秒 / 1000
TOKEN_TIMEOUT = 5.0      # 5000ms
CHARTS_TIMEOUT = 5.0     # 5000ms
LEGACY_TIMEOUT = 15.0    # 15000ms
ROUTE_TIMEOUT = 5.0      # 5000ms
PROXY_TIMEOUT = 10.0     # 10000ms

# 代理白名单（SSRF 防护，与 Node 一致）
PROXY_ALLOWED_HOSTS = ("navigraph.com", "ccflysim.cn", "skylitefly.com")

_INTERNAL_PREFIX_RE = re.compile(r"^(127\.|10\.|192\.168\.|169\.254\.|0\.)")
_INTERNAL_172_RE = re.compile(r"^172\.(1[6-9]|2\d|3[01])\.")
_INTERNAL_EXACT = frozenset({"localhost", "::1", "0.0.0.0"})


def _dotenv_value(name: str) -> str:
    """从项目根 .env 读取（Node 用 dotenv 注入 process.env；config.py 不声明该键）。"""
    for candidate in (Path(".env"), Path(__file__).resolve().parents[2] / ".env"):
        try:
            if not candidate.is_file():
                continue
            for raw in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() != name:
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                return value
        except OSError:
            continue
    return ""


def _env(name: str) -> str:
    return (os.environ.get(name) or _dotenv_value(name) or "").strip()


# 安全(2026-08-07)：不内置默认 refresh token，生产必须经环境变量提供
NAVIGRAPH_REFRESH_TOKEN = _env("NAVIGRAPH_REFRESH_TOKEN")


class ChartsUpstreamError(RuntimeError):
    """外部航图数据源失败（对应 Node 里的 throw new Error(...)）。"""


# ===== Navigraph access token =====
async def get_navigraph_token() -> str:
    """获取 Navigraph access token（带缓存，5s 超时，失败快速回退）。"""
    cached = charts_cache.get_valid_token()
    if cached:
        return cached

    body = {
        "grant_type": "refresh_token",
        "refresh_token": NAVIGRAPH_REFRESH_TOKEN,
        "client_id": NAVIGRAPH_CLIENT_ID,
    }
    try:
        async with httpx.AsyncClient(timeout=TOKEN_TIMEOUT, follow_redirects=True) as client:
            response = await client.post(
                NAVIGRAPH_TOKEN_URL,
                data=body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except Exception as exc:  # 网络/超时
        raise ChartsUpstreamError(f"Navigraph 认证请求失败: {exc}") from exc

    if response.status_code >= 400:
        err_text = ""
        try:
            err_text = response.text
        except Exception:  # noqa: BLE001
            err_text = ""
        raise ChartsUpstreamError(f"Navigraph 认证失败 ({response.status_code}): {err_text}")

    try:
        data = response.json()
    except Exception as exc:  # noqa: BLE001
        raise ChartsUpstreamError(f"Navigraph 认证响应解析失败: {exc}") from exc

    token = ""
    if isinstance(data, dict):
        token = str(data.get("access_token") or "")
        charts_cache.store_token(token, data.get("expires_in"))
    return token


async def query_navigraph_charts(icao: str, rules: str = "IFR") -> dict[str, Any]:
    """通过 Navigraph API 查询航图（5s 超时）。"""
    token = await get_navigraph_token()
    url = f"{NAVIGRAPH_CHARTS_API}/{icao.upper()}?version=STD&rules={rules}"
    try:
        async with httpx.AsyncClient(timeout=CHARTS_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    except Exception as exc:  # noqa: BLE001
        raise ChartsUpstreamError(f"Navigraph 请求失败: {exc}") from exc

    if response.status_code >= 400:
        raise ChartsUpstreamError(f"Navigraph API 错误 ({response.status_code})")
    try:
        data = response.json()
    except Exception as exc:  # noqa: BLE001
        raise ChartsUpstreamError(f"Navigraph 响应解析失败: {exc}") from exc
    charts = data.get("charts") if isinstance(data, dict) else None
    return {"charts": charts or []}


async def query_legacy_charts(
    icao: str, provider: str = "jeppesen", rules: str = "IFR"
) -> Any:
    """通过原始 ccflysim API 查询航图（15s 超时）。"""
    url = f"{CFY_API}/charts?icao={icao.upper()}&provider={provider}&rules={rules}"
    try:
        async with httpx.AsyncClient(timeout=LEGACY_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(url)
    except Exception as exc:  # noqa: BLE001
        raise ChartsUpstreamError(f"原始 API 请求失败: {exc}") from exc

    if response.status_code >= 400:
        raise ChartsUpstreamError(f"原始 API 错误 ({response.status_code})")
    try:
        return response.json()
    except Exception as exc:  # noqa: BLE001
        raise ChartsUpstreamError(f"原始 API 响应解析失败: {exc}") from exc


async def query_legacy_route(path: str, dep: str, arr: str, xt: Any = None) -> Any:
    """航路查询的单次尝试（5s 超时，非 2xx 也照常解析，与 Node 一致）。"""
    url = f"{CFY_API}/{path}?dep={dep}&arr={arr}"
    if xt:
        url += f"&xt={xt}"
    async with httpx.AsyncClient(timeout=ROUTE_TIMEOUT, follow_redirects=True) as client:
        response = await client.get(url)
    return response.json()


# ===== 机场坐标 =====
async def get_airport_coords(
    db: Optional[AsyncSession], icao: str
) -> Optional[dict[str, float]]:
    """优先数据库 Airport 表，其次后备字典（对齐 Node `getAirportCoords`）。"""
    if db is not None:
        try:
            row = (
                await db.execute(
                    text("SELECT `lat`, `lon` FROM `Airport` WHERE `icao` = :icao LIMIT 1"),
                    {"icao": icao},
                )
            ).first()
            if row is not None:
                mapping = row._mapping
                lat = mapping["lat"]
                lon = mapping["lon"]
                if lat and lon:  # JS: ap?.lat && ap?.lon（0 视为缺失）
                    return {"lat": float(lat), "lon": float(lon)}
        except Exception:  # noqa: BLE001
            pass
    return charts_cache.AIRPORT_COORDS.get(icao)


# ===== 航图图片 URL 改写 / 代理白名单 =====
# encodeURIComponent 不转义这些字符（其余按 Python quote 默认规则处理）
_JS_URI_COMPONENT_SAFE = "!'()*-._~"


def rewrite_url(url: Any) -> Any:
    """外部图片 URL → 本地代理路径（与 Node `rewriteUrl` 一致）。"""
    if not isinstance(url, str) or not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return f"/api/charts/proxy?url={urllib.parse.quote(url, safe=_JS_URI_COMPONENT_SAFE)}"
    return url


CHART_URL_FIELDS = (
    "image_day_url",
    "image_night_url",
    "thumb_day_url",
    "thumb_night_url",
    "url",
)


def rewrite_chart_urls(data: Any) -> Any:
    """把响应里的航图图片地址改写成代理路径（原地修改并返回同一对象）。"""
    if isinstance(data, dict):
        inner = data.get("data")
        charts = None
        if isinstance(inner, dict) and isinstance(inner.get("charts"), list):
            charts = inner.get("charts")
        elif isinstance(data.get("charts"), list):
            charts = data.get("charts")
        if charts is not None:
            for chart in charts:
                if not isinstance(chart, dict):
                    continue
                for field in CHART_URL_FIELDS:
                    if chart.get(field):
                        chart[field] = rewrite_url(chart[field])
    return data


def is_internal_ip(host: str) -> bool:
    """内网 / 环回 / 链路本地地址判定（与 Node `isInternalIp` 一致）。"""
    if not host:
        return True
    return bool(
        _INTERNAL_PREFIX_RE.match(host)
        or _INTERNAL_172_RE.match(host)
        or host in _INTERNAL_EXACT
    )


def is_proxy_allowed(url: str) -> bool:
    """代理目标校验：仅 http(s) + 非内网 + 白名单域名（与 Node `isProxyAllowed` 一致）。"""
    try:
        parts = urllib.parse.urlsplit(url)
        host = (parts.hostname or "").lower()
    except Exception:  # noqa: BLE001
        return False
    if parts.scheme not in ("http", "https"):
        return False
    if is_internal_ip(host):
        return False
    return any(host == domain or host.endswith("." + domain) for domain in PROXY_ALLOWED_HOSTS)


def proxy_auth_headers(url: str) -> dict[str, str]:
    """仅当目标是 Navigraph CDN 且缓存里有 token 时附加 Bearer（不泄露给客户端）。"""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; CWFLY/1.0)",
        "Referer": "https://www.cwflysim.cn/",
        "Accept": "image/webp,image/*,*/*",
    }
    if "navigraph.com" in url:
        token = charts_cache.peek_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
    return headers


__all__ = [
    "NAVIGRAPH_TOKEN_URL",
    "NAVIGRAPH_CHARTS_API",
    "NAVIGRAPH_CLIENT_ID",
    "NAVIGRAPH_REFRESH_TOKEN",
    "CFY_API",
    "ROUTE_PATHS",
    "TOKEN_TIMEOUT",
    "CHARTS_TIMEOUT",
    "LEGACY_TIMEOUT",
    "ROUTE_TIMEOUT",
    "PROXY_TIMEOUT",
    "PROXY_ALLOWED_HOSTS",
    "CHART_URL_FIELDS",
    "ChartsUpstreamError",
    "get_navigraph_token",
    "query_navigraph_charts",
    "query_legacy_charts",
    "query_legacy_route",
    "get_airport_coords",
    "rewrite_url",
    "rewrite_chart_urls",
    "is_internal_ip",
    "is_proxy_allowed",
    "proxy_auth_headers",
]
