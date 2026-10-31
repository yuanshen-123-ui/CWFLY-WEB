"""/api/security 路由（逐接口对齐 Node src/routes/security.js）。

端点：
- GET  /api/security/pixel.gif      1×1 透明 GIF 追踪像素（限流 120/min，非阻塞写 SecurityEvent）
- POST /api/security/network-info   可信来源回填 SSID/BSSID（限流 60/min）
- GET  /api/security/events         安全事件查询（管理员，rating >= 11）

Node 源文件里的 loginLimiter / registerLimiter / verifyLimiter / codeFpLimiter /
adminLimiter / sensitiveLimiter 属于「被其它路由 import 的限流器定义」，本文件不再导出；
Python 侧已在 app/middleware/rate_limit.py 统一实现（对应 login_limiter / register_limiter /
sensitive_limiter 等），verify.py 需要的两个限流器在其自身模块内按 Limit(...) 构造。
"""
from __future__ import annotations

import base64
import datetime as dt
import logging
import math
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, require_rating
from app.middleware.rate_limit import Limit, PIXEL, NETWORK_INFO, rate_limiter
from app.services import security_events
from app.utils.client import (
    get_client_ip,
    get_device_fp,
    get_referrer,
    get_user_agent,
    get_user_id,
)
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.security")
router = APIRouter(prefix="/security", tags=["security"])

# SecurityEvent 数据保留期（小时，默认 720 = 30 天；对应 Node 的 SECURITY_RETENTION_HOURS）
SECURITY_RETENTION_HOURS = security_events.SECURITY_RETENTION_HOURS

# 1×1 透明 GIF：与 Node 完全相同的 base64 常量 → 43 字节
TRANSPARENT_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)

# 追踪像素限流：每 IP 每分钟 120 次（Node pixelLimiter：windowMs 60s, max 120）
pixel_limiter = rate_limiter(Limit(PIXEL.scope, PIXEL.window_seconds, PIXEL.max_requests, PIXEL.message))

# 网络信息上报限流：每 IP 每分钟 60 次（Node networkInfoLimiter）
network_info_limiter = rate_limiter(
    Limit(NETWORK_INFO.scope, NETWORK_INFO.window_seconds, NETWORK_INFO.max_requests, NETWORK_INFO.message)
)

# 安全事件列表最多回看 90 天（Node: Math.min(..., 24 * 90)）
MAX_HOURS = 24 * 90


# ==================== 响应工具（与 Node res.json 等价） ====================
def ok(data: Any = None, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    body.update(extra)
    return JSJSONResponse(body)


def fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


def _query_str(request: Request, name: str) -> str:
    value = request.query_params.get(name)
    return str(value) if value is not None else ""


def _with_rate_limit_headers(injected: Response, out: Response) -> Response:
    """把限流依赖写到注入 Response 上的 RateLimit-* 头搬到真正返回的 Response 上。

    FastAPI 在「路径函数返回 Response 对象」时不会合并注入的 Response，因此需要手动搬运；
    等价 Node express-rate-limit 的 `standardHeaders: true`（每个响应都带这三个头）。
    """
    for name in ("RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"):
        value = injected.headers.get(name)
        if value is not None:
            out.headers[name] = value
    return out


# ==================== 1. 追踪像素：1×1 透明 GIF ====================
@router.get("/pixel.gif", dependencies=[Depends(pixel_limiter)])
async def pixel_gif(request: Request, response: Response) -> Response:
    """GET /api/security/pixel.gif

    证据链字段：客户端 IP + 设备指纹 + UA + 来源页 + 登录用户 + 网络信息。
    写入数据库**不阻塞响应**（Node 里 create(...).catch(...) 是悬挂的 Promise）。
    """
    ip = get_client_ip(request)
    device_fp = get_device_fp(request)
    user_agent = get_user_agent(request)
    referrer = get_referrer(request)
    # 来源页面标识（<img> 无法带自定义头，只能走 query）
    ref_raw = request.query_params.get("_ref")
    path = str(ref_raw)[:500] if ref_raw else ""
    user_id = get_user_id(request)  # _uid 查询参数（登录 CID）
    net_raw = request.query_params.get("_net")  # effectiveType|downlink|rtt|saveData
    network = str(net_raw)[:200] if net_raw else ""

    # 非阻塞写入数据库（与 Node 一致：失败不影响响应）
    security_events.record_event_bg(
        {
            "ip": ip,
            "userAgent": user_agent,
            "referrer": referrer,
            "path": path,
            "deviceFp": device_fp,
            "userId": user_id,
            "network": network,
        }
    )

    # 返回 1×1 透明 GIF（字节、状态码、响应头与 Node 完全一致）
    return _with_rate_limit_headers(
        response,
        Response(
            content=TRANSPARENT_GIF,
            status_code=200,
            media_type="image/gif",
            headers={
                "Content-Type": "image/gif",
                "Content-Length": str(len(TRANSPARENT_GIF)),
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
                "Access-Control-Allow-Origin": "*",
            },
        ),
    )


# ==================== 1.5 网络信息上报 ====================
@router.post("/network-info", dependencies=[Depends(network_info_limiter)])
async def network_info(request: Request, response: Response) -> Any:
    """POST /api/security/network-info

    请求体 {ssid?, bssid?}；按设备指纹（X-Device-Fp）回填证据链。
    浏览器无标准 API 读取 WiFi SSID/BSSID，此端点供原生客户端/扩展/本机 Agent 调用。
    """
    try:
        ip = get_client_ip(request)
        device_fp = get_device_fp(request)
        user_agent = get_user_agent(request)

        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            body = {}

        # Node 解构默认值只对 undefined 生效（null 会被 String() 成 "null"）
        ssid = body["ssid"] if "ssid" in body else ""
        bssid = body["bssid"] if "bssid" in body else ""

        # 至少有设备指纹或 SSID 之一才记录，避免垃圾数据
        if not device_fp and not ssid:
            return _with_rate_limit_headers(response, fail(400, "缺少设备指纹或网络信息"))

        network = security_events.js_json_dumps(
            {
                "ssid": security_events.js_string(ssid)[:100],
                "bssid": security_events.js_string(bssid)[:100],
            }
        )

        security_events.record_event_bg(
            {
                "ip": ip,
                "userAgent": user_agent,
                "deviceFp": device_fp,
                "network": network,
                "path": "network-probe",
            },
            tag="[NetworkInfo]",
        )

        return _with_rate_limit_headers(response, JSJSONResponse({"success": True}))
    except Exception:
        return _with_rate_limit_headers(response, fail(500, "上报失败"))


# ==================== 2. 安全事件查询（管理员） ====================
@router.get("/events")
async def list_security_events(
    request: Request,
    current: CurrentUser = Depends(require_rating(11)),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """GET /api/security/events?hours=24&page=1&pageSize=50&ip=&fp=&uid=

    Node：`router.get('/events', authenticate, requireRating(11), ...)`
    """
    try:
        # Node: Math.min(Math.max(parseInt(hours) || SECURITY_RETENTION_HOURS, 1), 24*90)
        hours_raw = security_events.parse_int_like_js(request.query_params.get("hours"))
        hours = min(max(hours_raw or SECURITY_RETENTION_HOURS, 1), MAX_HOURS)

        # Node: Math.max(parseInt(page) || 1, 1)
        page = max(security_events.parse_int_like_js(request.query_params.get("page")) or 1, 1)

        # Node: Math.min(Math.max(parseInt(pageSize) || 50, 10), 200)
        page_size = min(
            max(security_events.parse_int_like_js(request.query_params.get("pageSize")) or 50, 10), 200
        )

        ip_filter = _query_str(request, "ip")
        fp_filter = _query_str(request, "fp")
        uid_filter = _query_str(request, "uid")
        cutoff = dt.datetime.utcnow() - dt.timedelta(hours=hours)

        total = await security_events.count_events(db, cutoff, ip_filter, fp_filter, uid_filter)
        events = await security_events.list_events(
            db,
            cutoff,
            skip=(page - 1) * page_size,
            take=page_size,
            ip=ip_filter,
            fp=fp_filter,
            uid=uid_filter,
        )
        top_ips = await security_events.top_ips(db, cutoff, take=20)

        body_response = JSJSONResponse(
            {
                "success": True,
                "data": {
                    "events": events,
                    "total": total,
                    "page": page,
                    "pageSize": page_size,
                    "totalPages": math.ceil(total / page_size) if page_size else 0,
                },
                "topIps": top_ips,
            }
        )
        # Node /events 无路由级限流器（仅 authenticate + requireRating(11)），故不加 RateLimit-* 头
        return body_response
    except Exception as exc:  # noqa: BLE001
        log.error("[Security] 查询失败: %s", exc)
        return fail(500, "查询失败")


__all__ = ["router", "SECURITY_RETENTION_HOURS", "TRANSPARENT_GIF"]
