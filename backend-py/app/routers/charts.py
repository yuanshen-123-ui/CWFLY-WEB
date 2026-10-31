"""/api/charts 路由（逐接口对齐 Node src/routes/charts.js）。

Node 里该 router 没有 `authenticate`（公开接口）：
  GET /        航图查询（Navigraph 与原始 API 并行竞速）
  GET /proxy   航图图片代理（域名白名单 + SSRF 防护，无需登录）
  GET /route   航路查询（多路径尝试 + 机场坐标推算距离/飞行时间）
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response

from app.db.session import get_db
from app.services import charts_cache, navigraph
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.charts")
router = APIRouter(prefix="/charts", tags=["charts"])


def _ok(data: Any = None, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return JSJSONResponse(body)


def _fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


async def _race_navigraph_and_legacy(
    icao: str, provider: str, rules: str
) -> tuple[Any, bool]:
    """对齐 Node `Promise.race([queryNavigraphCharts(...), queryLegacyCharts(...)])`。

    谁的响应先落定就用谁：Navigraph 成功 → fromNavigraph=True；先落定方抛错 → 向上抛
    （由调用方再单独重试一次原始 API，与 Node 的 catch 分支一致）。
    """
    nav_task = asyncio.ensure_future(navigraph.query_navigraph_charts(icao, rules))
    legacy_task = asyncio.ensure_future(navigraph.query_legacy_charts(icao, provider, rules))
    settled: list[asyncio.Future[Any]] = []
    nav_task.add_done_callback(settled.append)
    legacy_task.add_done_callback(settled.append)
    try:
        done, _pending = await asyncio.wait(
            {nav_task, legacy_task}, return_when=asyncio.FIRST_COMPLETED
        )
        await asyncio.sleep(0)  # 让完成回调执行，取得真实落定顺序（Promise.race 语义）
        if settled:
            first: asyncio.Future[Any] = settled[0]
        else:  # 兜底：同时完成时按数组顺序取 Navigraph
            first = nav_task if nav_task in done else legacy_task
        if first.cancelled():
            raise navigraph.ChartsUpstreamError("航图查询被取消")
        error = first.exception()
        if error is not None:
            raise error
        return first.result(), first is nav_task
    finally:
        # Node 的 Promise.race 忽略落败方结果；这里取消并吞掉其异常，避免悬挂任务告警
        for task in (nav_task, legacy_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(nav_task, legacy_task, return_exceptions=True)


# ==================== 航图查询 ====================
@router.get("")
async def query_charts(
    icao: Optional[str] = None,
    provider: str = "jeppesen",
    rules: str = "IFR",
) -> JSJSONResponse:
    """航图查询（Node L76）。"""
    if not icao:
        return _fail(400, "缺少 ICAO 代码")
    try:
        data: Any = None
        from_navigraph = False
        if provider == "jeppesen":
            try:
                data, from_navigraph = await _race_navigraph_and_legacy(icao, provider, rules)
                if from_navigraph:
                    log.info("[Charts] Navigraph 查询成功: %s", icao)
            except Exception:  # noqa: BLE001 - 两个都失败，最后再单独试一次原始 API
                data = await navigraph.query_legacy_charts(icao, provider, rules)
        else:
            data = await navigraph.query_legacy_charts(icao, provider, rules)

        # 外部图片 URL → 本地代理路径（解决 CORS / 防盗链）
        data = navigraph.rewrite_chart_urls(data)
        return JSJSONResponse({"success": True, "data": data, "fromNavigraph": from_navigraph})
    except Exception as exc:  # noqa: BLE001
        log.error("[charts.py] %s", exc)
        return _fail(500, "操作失败")


# ==================== 航图图片代理 ====================
@router.get("/proxy")
async def proxy_chart_image(url: Optional[str] = None) -> Response:
    """航图图片代理（Node L147）：白名单外 403，上游非 2xx 原样透传，异常 504。"""
    if not url:
        return Response(status_code=400)
    if not navigraph.is_proxy_allowed(url):
        return _fail(403, "目标地址不在代理白名单")

    try:
        headers = navigraph.proxy_auth_headers(url)
        async with httpx.AsyncClient(
            timeout=navigraph.PROXY_TIMEOUT, follow_redirects=True
        ) as client:
            upstream = await client.get(url, headers=headers)
        if not 200 <= upstream.status_code < 300:
            return Response(status_code=upstream.status_code)
        content_type = upstream.headers.get("content-type") or "image/png"
        return Response(
            content=upstream.content,
            headers={
                "Content-Type": content_type,
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception:  # noqa: BLE001 - 超时 / 连接失败 → 504
        return Response(status_code=504)


# ==================== 航路查询 ====================
@router.get("/route")
async def query_route(
    dep: Optional[str] = None,
    arr: Optional[str] = None,
    xt: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """航路查询（Node L249）：多路径尝试 + 机场坐标算距离/飞行时间。"""
    if not dep or not arr:
        return _fail(400, "缺少起降机场")
    try:
        dep_icao = dep.upper()
        arr_icao = arr.upper()

        # 依次尝试多个可能的 API 路径
        data: Any = None
        for path in navigraph.ROUTE_PATHS:
            try:
                candidate = await navigraph.query_legacy_route(path, dep_icao, arr_icao, xt)
            except Exception:  # noqa: BLE001
                continue
            # 对齐 `if (d.success !== false || d.data)`：只有明确 success === false 才算失败
            if not (isinstance(candidate, dict) and candidate.get("success") is False):
                data = candidate
                break
            if isinstance(candidate, dict) and candidate.get("data"):
                data = candidate
                break

        # 机场坐标 → 大圆距离 / 预计飞行时间（平均地速 420kt）
        distance: Optional[int] = None
        flight_time: Optional[str] = None
        try:
            dep_pos, arr_pos = await asyncio.gather(
                navigraph.get_airport_coords(db, dep_icao),
                navigraph.get_airport_coords(db, arr_icao),
            )
            if dep_pos and arr_pos:
                nm = charts_cache.great_circle_distance(
                    dep_pos["lat"], dep_pos["lon"], arr_pos["lat"], arr_pos["lon"]
                )
                distance = nm
                mins = charts_cache.js_round(nm / 420 * 60)
                flight_time = (
                    f"{mins // 60}h{mins % 60}m" if mins >= 60 else f"{mins}m"
                )
        except Exception:  # noqa: BLE001 - 坐标查询失败不影响主流程
            pass

        # 从 SimBrief 格式中提取备降场
        alternate: Optional[str] = None
        source = data if isinstance(data, dict) else {}
        route_text = source.get("route")
        if isinstance(route_text, str):
            fields = charts_cache.parse_simbrief_route(route_text)
            if fields and fields.get("Alternate"):
                alternate = fields["Alternate"]

        payload = {
            **source,
            "dep": dep_icao,
            "arr": arr_icao,
            "distance": charts_cache.js_or(distance, source.get("distance"), ""),
            "flight_time": charts_cache.js_or(
                flight_time, source.get("flight_time"), source.get("ete"), ""
            ),
            "alternate": charts_cache.js_or(alternate, source.get("alternate"), ""),
        }
        return _ok(payload)
    except Exception as exc:  # noqa: BLE001
        log.error("[charts.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
