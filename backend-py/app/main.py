"""FastAPI 入口（对齐 Node server.js 的中间件顺序与全局行为）。

启动：uvicorn app.main:app --host 127.0.0.1 --port 3001
灰度：nginx 按路径前缀把请求转到本服务（见 README，先切 /api/auth）。
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response
from starlette.staticfiles import StaticFiles

from app.config import settings
from app.db.session import dispose_engine
from app.deps import AuthFailure
from app.middleware.gateway import GatewayMiddleware
from app.middleware.ip_ban import IpBanMiddleware, preload_bans
from app.middleware.rate_limit import (
    GLOBAL_API,
    RateLimitExceeded,
    RateLimitMiddleware,
)
from app.routers import iter_routers
from app.services.bootstrap import init_admin
from app.utils.json_compat import JSJSONResponse, js_iso

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("cwfly.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 与 Node 版一致：服务就绪前完成管理员初始化
    await init_admin()
    await preload_bans()
    try:
        from app.jobs.scheduler import warmup

        await warmup()   # IP/设备名单预热 + 首轮 whazzup（对应 Node ensureBansLoaded/启动首刷）
        from app.services.ip_tracker import start_ip_tracker

        start_ip_tracker()
        from app.services.rate_limit_store import ensure_table as _ensure_rate_limit_table

        await _ensure_rate_limit_table()
    except Exception as exc:  # noqa: BLE001
        log.warning("[CWFLY] 预热失败: %s", exc)
    # 预热：DB 连接池 + FIR 边界（消除每个 worker 的首请求冷启动）
    try:
        from sqlalchemy import text as _text

        from app.db.session import engine as _engine

        async def _warm_db() -> None:
            conns = []
            try:
                for _ in range(8):
                    conn = await _engine.connect()
                    conns.append(conn)
                for conn in conns:
                    await conn.execute(_text("SELECT 1"))
            finally:
                for conn in conns:
                    try:
                        await conn.close()
                    except Exception:  # noqa: BLE001
                        pass

        await _warm_db()
        from app.services.controller_boundaries import load_fir_boundaries

        await load_fir_boundaries()
        log.info("[CWFLY] DB 连接池 / FIR 边界预热完成")
    except Exception as exc:  # noqa: BLE001
        log.warning("[CWFLY] 预热失败: %s", exc)

    # 生产多 worker 时 API 进程不跑定时任务（由 cwfly-worker-py 单独执行）；
    # 本地开发默认仍在本进程启动，方便单进程调试。
    _bg_jobs = os.getenv("BACKGROUND_JOBS", "1") not in ("0", "false", "False", "no")
    try:
        from app.jobs.scheduler import start_jobs

        if _bg_jobs:
            start_jobs()
        else:
            log.info("[CWFLY] BACKGROUND_JOBS=0：定时任务由 worker 进程负责")
    except Exception as exc:  # noqa: BLE001
        log.warning("[CWFLY] 定时任务未启用: %s", exc)
    log.info("[CWFLY] FastAPI 后端已启动（PORT=%s, env=%s）", settings.PORT, settings.NODE_ENV)
    try:
        yield
    finally:
        try:
            from app.services.ip_tracker import stop_ip_tracker

            await stop_ip_tracker()
            from app.jobs.scheduler import stop_jobs

            await stop_jobs()
        except Exception:  # noqa: BLE001
            pass
        await dispose_engine()


app = FastAPI(
    title="CWFLY API",
    version="2.0.0",
    lifespan=lifespan,
    # Node 版没有 /docs /openapi.json，这里同样关闭，避免暴露额外端点
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# ---------- 中间件（注册顺序与 Node server.js 对应；Starlette 后注册的更靠外层） ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Renewed-Token"],
)
app.add_middleware(GatewayMiddleware)            # UA 过滤 + 安全头 + 续签/限流头 + IP 聚合 + 访问日志（合并）
app.add_middleware(IpBanMiddleware)              # IP 封禁（IpBan > 白名单 > IpList）
app.add_middleware(RateLimitMiddleware, limit=GLOBAL_API)  # /api 全局 60 次/分钟

# ---------- 静态文件（路径与 Node 完全一致） ----------
for sub in ("avatars", "posters", "backgrounds"):
    app.mount(
        f"/uploads/{sub}",
        StaticFiles(directory=f"uploads/{sub}", check_dir=False),
        name=f"uploads-{sub}",
    )
app.mount("/uploads/airports", StaticFiles(directory="app/data", check_dir=False), name="airport-data")
app.mount("/uploads", StaticFiles(directory="uploads", check_dir=False), name="uploads")


# ---------- 全局异常处理 ----------
@app.exception_handler(AuthFailure)
async def _auth_failure_handler(request: Request, exc: AuthFailure) -> Response:
    return JSJSONResponse({"success": False, "message": exc.message}, status_code=exc.status_code)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    return JSJSONResponse(
        {"success": False, "message": exc.message},
        status_code=429,
        headers={
            "RateLimit-Limit": str(exc.limit),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": str(exc.reset),
        },
    )


@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> Response:
    path = request.url.path
    # Node 版 /uploads 下不存在文件时返回空 404（无 JSON 体）
    if path.startswith("/uploads"):
        return Response(status_code=exc.status_code or 404)
    if exc.status_code == 404:
        return JSJSONResponse({"success": False, "message": "资源不存在"}, status_code=404)
    detail = exc.detail if isinstance(exc.detail, str) else "请求失败"
    return JSJSONResponse({"success": False, "message": detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def _validation_handler(request: Request, exc: RequestValidationError) -> Response:
    return JSJSONResponse({"success": False, "message": "请求参数错误"}, status_code=400)


@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception) -> Response:
    log.exception("[Error] %s", exc)
    return JSJSONResponse({"success": False, "message": "服务器内部错误"}, status_code=500)


# ---------- 路由 ----------
api = APIRouter(prefix="/api")
for _router in iter_routers():
    api.include_router(_router)
app.include_router(api)


@app.get("/health")
async def health() -> Response:
    import datetime as dt

    return JSJSONResponse(
        {
            "success": True,
            "message": "CWFLY 服务运行正常",
            "timestamp": js_iso(dt.datetime.now(dt.timezone.utc)),
        }
    )


@app.get("/whazzup.json")
async def whazzup_json() -> Response:
    """在线状态 JSON（对齐 Node server.js：有缓存返回数据，未就绪返回 503）。"""
    try:
        from app.services.whazzup import get_cached_whazzup

        data = get_cached_whazzup()
    except Exception:
        data = None
    if data is not None:
        return JSONResponse(
            data,
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=15"},
        )
    return JSONResponse(
        {"error": "whazzup data not ready"},
        status_code=503,
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=15"},
    )


__all__ = ["app"]
