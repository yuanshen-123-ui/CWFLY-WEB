"""/api/checkin 路由（逐接口对齐 Node src/routes/checkin.js）。

- POST /        签到（body: eventId）→ 直接回写 CheckInRecord 记录
- GET  /history 我的签到历史（按 id 倒序）

`eventTitle` 为 `活动 #<String(eventId)>`，`time` 为 `new Date().toLocaleString('zh-CN')`
本地时间字符串（CheckInRecord.time 是字符串列，不做时区转换）。
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services.flightplans import zh_now_string
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.checkin")
router = APIRouter(prefix="/checkin", tags=["checkin"])

_RECORD_COLS = "id, userId, eventId, eventTitle, time"

_MISSING = object()


def _ok(data: Any = None) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    return JSJSONResponse(body)


def _fail(status_code: int, message: str) -> JSJSONResponse:
    return JSJSONResponse({"success": False, "message": message}, status_code=status_code)


def _js_string(value: Any) -> str:
    """等价 JS `String(value)`（缺省值 → 'undefined'）。"""
    if value is _MISSING:
        return "undefined"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, dict):
        return "[object Object]"
    if isinstance(value, (list, tuple)):
        return ",".join(_js_string(v) for v in value)
    return str(value)


async def _read_json(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return body if isinstance(body, dict) else {}


@router.post("")
async def create_checkin(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await _read_json(request)
        event_id = _js_string(body.get("eventId", _MISSING))
        result = await db.execute(
            text(
                "INSERT INTO `CheckInRecord` (userId, eventId, eventTitle, time) "
                "VALUES (:userId, :eventId, :eventTitle, :time)"
            ),
            {
                "userId": current.cid,
                "eventId": event_id,
                "eventTitle": f"活动 #{event_id}",
                "time": zh_now_string(),
            },
        )
        await db.commit()
        record_id = int(result.lastrowid)
        row = (
            await db.execute(
                text(f"SELECT {_RECORD_COLS} FROM `CheckInRecord` WHERE id = :id LIMIT 1"),
                {"id": record_id},
            )
        ).first()
        data = dict(row._mapping) if row is not None else {
            "id": record_id,
            "userId": current.cid,
            "eventId": event_id,
            "eventTitle": f"活动 #{event_id}",
            "time": zh_now_string(),
        }
        return _ok(data)
    except Exception as exc:  # noqa: BLE001
        log.error("[checkin.js] %s", exc)
        return _fail(500, "操作失败")


@router.get("/history")
async def checkin_history(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        rows = (
            await db.execute(
                text(
                    f"SELECT {_RECORD_COLS} FROM `CheckInRecord` "
                    "WHERE userId = :uid ORDER BY id DESC"
                ),
                {"uid": current.cid},
            )
        ).all()
        return _ok([dict(r._mapping) for r in rows])
    except Exception as exc:  # noqa: BLE001
        log.error("[checkin.js] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
