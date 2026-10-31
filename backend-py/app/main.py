"""FastAPI 入口（对齐 Node server.js 的中间件顺序与全局行为）。

启动：uvicorn app.main:app --host 127.0.0.1 --port 3001
灰度：nginx 按路径前缀把请求转到本服务（见 README，先切 /api/auth）。
"""
from __future__ import annotations

import logging
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
from app.middleware.access_log import AccessLogMiddleware
from app.middleware.ip_ban import IpBanMiddleware
from app.middleware.rate_limit import (
    GLOBAL_API,
    RateLimitExceeded,
    RateLimitMiddleware,
)
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.routers import auth
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
    log.info("[CWFLY] FastAPI 后端已启动（PORT=%s, env=%s）", settings.PORT, settings.NODE_ENV)
    try:
        yield
    finally:
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
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Renewed-Token"],
)
app.add_middleware(AccessLogMiddleware)          # morgan
app.add_middleware(SecurityHeadersMiddleware)    # helmet / 安全响应头
app.add_middleware(IpBanMiddleware)              # IP 封禁（P3 完整实现）
app.add_middleware(RateLimitMiddleware, limit=GLOBAL_API)  # /api 全局 60 次/分钟

# ---------- 静态文件（路径与 Node 完全一致） ----------
for sub in ("avatars", "posters", "backgrounds"):
    app.mount(
        f"/uploads/{sub}",
        StaticFiles(directory=f"uploads/{sub}", check_dir=False),
        name=f"uploads-{sub}",
    )
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
api.include_router(auth.router)
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
    """在线状态 JSON（P2 移植 whazzup 缓存后返回真实数据；未就绪时与 Node 一致返回 503）。"""
    return JSONResponse(
        {"error": "whazzup data not ready"},
        status_code=503,
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=15"},
    )


__all__ = ["app"]
