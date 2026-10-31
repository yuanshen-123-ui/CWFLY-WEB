"""/api/tracks 路由（逐接口对齐 Node src/routes/tracks.js）。

公开只读（Node 未加 authenticate）：
- GET /sessions?callsign=&limit=20   可回放的会话列表
- GET /session/:id                   单个会话的航迹点（时间正序，最多 20000）
- GET /latest/:callsign              302 跳转到该呼号最近会话的 /api/tracks/session/:id
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import tracks_service as tks
from app.services.js_compat_service import js_callsign, js_parse_int
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.tracks")
router = APIRouter(prefix="/tracks", tags=["tracks"])


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


@router.get("/sessions")
async def sessions(
    callsign: str | None = None,
    limit: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    try:
        cs = js_callsign(callsign)
        # Node: Math.min(Math.max(toInt(limit, 20), 1), 100)
        n = js_parse_int(limit, 20)
        n = min(max(n, 1), 100)
        return _ok(await tks.list_sessions(db, cs, n))
    except Exception as exc:  # noqa: BLE001
        log.error("[tracks] sessions failed: %s", exc)
        return _fail(500, "获取回放列表失败")


@router.get("/session/{session_id}")
async def session_points(
    session_id: str, db: AsyncSession = Depends(get_db)
) -> JSJSONResponse:
    try:
        sid = js_parse_int(session_id, -1)
        if sid < 0:
            return _fail(400, "无效的会话 ID")
        rows = await tks.list_session_points(db, sid)
        if not rows:
            return _fail(404, "该会话没有航迹数据")
        return _ok(rows)
    except Exception as exc:  # noqa: BLE001
        log.error("[tracks] session failed: %s", exc)
        return _fail(500, "获取航迹失败")


@router.get("/latest/{callsign}")
async def latest(callsign: str, db: AsyncSession = Depends(get_db)) -> Any:
    try:
        cs = js_callsign(callsign)
        if not cs:
            return _fail(400, "无效呼号")
        sid = await tks.latest_session_id(db, cs)
        if sid is None:
            return _fail(404, "没有该呼号的航迹")
        # Node: res.redirect(`/api/tracks/session/${sessionId}`) —— 默认 302
        return RedirectResponse(url=f"/api/tracks/session/{sid}", status_code=302)
    except Exception as exc:  # noqa: BLE001
        log.error("[tracks] latest failed: %s", exc)
        return _fail(500, "获取航迹失败")


__all__ = ["router"]
