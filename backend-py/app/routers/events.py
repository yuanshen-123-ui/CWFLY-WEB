"""/api/events 路由（逐接口对齐 Node src/routes/events.js）。

公开：GET /
鉴权：GET /my、GET /my-registrations、GET /:id、POST /:id/join、DELETE /:id/join、
      DELETE /registrations/:id
权限（event）：POST /、PUT /:id、DELETE /:id

注意路径顺序：`/my`、`/my-registrations`、`/registrations/:id` 必须排在 `/:id` 之前。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user, require_permission
from app.services import events_service as ev
from app.utils.json_compat import JSJSONResponse
from app.utils.security import string_to_perms

log = logging.getLogger("cwfly.events")
router = APIRouter(prefix="/events", tags=["events"])

MESSAGE_OPERATION_FAILED = "操作失败"


def _ok(data: Any = None, message: str | None = None) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    if message is not None:
        body["message"] = message
    return JSJSONResponse(body)


def _fail(status_code: int, message: str) -> JSJSONResponse:
    return JSJSONResponse({"success": False, "message": message}, status_code=status_code)


async def _read_json(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return body if isinstance(body, dict) else {}


def _number_param(raw: str) -> int | None:
    """等价 `Number(req.params.id)`：非法值让 Node 侧抛错（→ 500「操作失败」）。"""
    if re.fullmatch(r"-?\d+", raw or ""):
        try:
            return int(raw)
        except ValueError:
            return None
    return None


async def _dynamic_status_for(
    db: AsyncSession, event_id: int, fallback: str
) -> str:
    """动态状态（需全列表判断「最近的未来」→ 报名中）。失败保持原状态。"""
    try:
        all_events = await ev.list_all_events_unordered(db)
        for item in ev.apply_dynamic_status(all_events):
            if int(item.get("id") or 0) == int(event_id):
                return str(item.get("status") or fallback)
    except Exception:  # noqa: BLE001
        return fallback
    return fallback


# ==================== POST / 创建活动 ====================
@router.post("", dependencies=[Depends(require_permission("event"))])
async def create_event(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await _read_json(request)
        title = body.get("title")
        if not title:
            return _fail(400, "缺少活动标题")
        event = await ev.create_event(
            db,
            {
                "title": title,
                "date": body.get("date") or "",
                "time": body.get("time") or "",
                "dep": body.get("dep") or "",
                "arr": body.get("arr") or "",
                "route": body.get("route") or "",
                "distance": body.get("distance") or "",
                "notams": body.get("notams") or "",
                "desc": body.get("desc") or "",
                "poster": body.get("poster") or "",
                "atcPositions": body.get("atcPositions") or "",
                "publisher": body.get("publisher") or current.cid or "",
                "status": body.get("status") or "报名中",
            },
        )
        return _ok(event)
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== PUT /:id 更新活动 ====================
@router.put("/{event_id}", dependencies=[Depends(require_permission("event"))])
async def update_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    try:
        parsed_id = _number_param(event_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        existing = await ev.get_event(db, parsed_id)
        if not existing:
            return _fail(404, "活动不存在")

        body = await _read_json(request)
        values: dict[str, Any] = {}
        for key in (
            "title",
            "date",
            "time",
            "dep",
            "arr",
            "route",
            "distance",
            "notams",
            "desc",
            "poster",
            "atcPositions",
            "publisher",
            "status",
        ):
            if key in body:
                values[key] = body[key]
        updated = await ev.update_event(db, parsed_id, values)
        if updated is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        return _ok(updated)
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== DELETE /registrations/:id 取消报名 ====================
@router.delete("/registrations/{reg_id}")
async def cancel_registration(
    reg_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        parsed_id = _number_param(reg_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        reg = await ev.get_registration(db, parsed_id)
        if not reg:
            return _fail(404, "报名记录不存在")

        is_admin = (current.rating or 0) >= 9 or "event" in string_to_perms(current.permissions)
        # 非管理员只能取消自己的报名
        if not is_admin and str(reg.get("userId")) != str(current.cid):
            return _fail(403, "只能取消自己的报名")

        await ev.set_registration_status(db, parsed_id, ev.STATUS_CANCELLED)
        return _ok(message="已取消报名")
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== DELETE /:id 删除活动 ====================
@router.delete("/{event_id}", dependencies=[Depends(require_permission("event"))])
async def delete_event(event_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        parsed_id = _number_param(event_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        existing = await ev.get_event(db, parsed_id)
        if not existing:
            return _fail(404, "活动不存在")
        await ev.delete_event_registrations(db, parsed_id)
        await ev.delete_event(db, parsed_id)
        return _ok(message="已删除")
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== GET / 活动列表（公开） ====================
@router.get("")
async def list_events(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        events = await ev.list_events(db)
        counts = await ev.registration_counts(db)
        enriched = ev.enrich_events(events, counts)
        return _ok(ev.apply_dynamic_status(enriched))
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== GET /my 我的报名（含已取消） ====================
@router.get("/my")
async def my_registrations(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        registrations = await ev.list_user_registrations(db, current.cid, only_active=False)
        all_events = await ev.list_all_events_unordered(db)
        status_map = {
            int(item.get("id") or 0): item.get("status")
            for item in ev.apply_dynamic_status(all_events)
        }
        data = [
            {
                **reg,
                "event": _with_status(await ev.get_event(db, int(reg.get("eventId") or 0)), status_map),
            }
            for reg in registrations
        ]
        return _ok(data)
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== GET /my-registrations 我的有效报名 ====================
@router.get("/my-registrations")
async def my_active_registrations(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        registrations = await ev.list_user_registrations(db, current.cid, only_active=True)
        all_events = await ev.list_all_events_unordered(db)
        status_map = {
            int(item.get("id") or 0): item.get("status")
            for item in ev.apply_dynamic_status(all_events)
        }
        data = [
            {
                **reg,
                "event": _with_status(await ev.get_event(db, int(reg.get("eventId") or 0)), status_map),
            }
            for reg in registrations
        ]
        return _ok(data)
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


def _with_status(
    event: dict[str, Any] | None, status_map: dict[int, Any]
) -> dict[str, Any] | None:
    """Node: `ev ? { ...ev, status: statusMap.get(ev.id) || ev.status } : ev`。"""
    if not event:
        return None
    return {**event, "status": status_map.get(int(event.get("id") or 0)) or event.get("status")}


# ==================== GET /:id 活动详情（公开） ====================
@router.get("/{event_id}")
async def get_event_detail(event_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        parsed_id = _number_param(event_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        event = await ev.get_event(db, parsed_id)
        if not event:
            return _fail(404, "活动不存在")

        event_status = await _dynamic_status_for(db, parsed_id, str(event.get("status") or ""))

        pilots = await ev.list_event_registrations(db, parsed_id, "pilot")
        controllers = await ev.list_event_registrations(db, parsed_id, "controller")
        user_ids = [str(p.get("userId") or "") for p in pilots] + [
            str(c.get("userId") or "") for c in controllers
        ]
        user_map = await ev.users_by_cids(db, user_ids)

        return _ok(
            {
                **event,
                "status": event_status,
                "pilots": [
                    {**p, "user": user_map.get(str(p.get("userId") or ""))} for p in pilots
                ],
                "controllers": [
                    {**c, "user": user_map.get(str(c.get("userId") or ""))} for c in controllers
                ],
                "pilotCount": len(pilots),
                "controllerCount": len(controllers),
                "registrationCount": len(pilots) + len(controllers),
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== POST /:id/join 报名 ====================
@router.post("/{event_id}/join")
async def join_event(
    event_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        parsed_id = _number_param(event_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        event = await ev.get_event(db, parsed_id)
        if not event:
            return _fail(404, "活动不存在")

        # 与前端一致的动态状态校验
        dyn_status = await _dynamic_status_for(db, parsed_id, str(event.get("status") or ""))
        if dyn_status == "已结束":
            return _fail(400, "该活动已结束，无法报名")

        body = await _read_json(request)
        reg_type = "controller" if body.get("type") == "controller" else "pilot"
        callsign = body.get("callsign")
        aircraft = body.get("aircraft")
        position = body.get("position")

        saved_callsign = callsign or ""
        saved_frequency = ""
        if reg_type == "controller":
            # 管制员报名时校验用户是否具备管制员资格（fsdLevel >= 1 = OBS，或 SUP/ADM rating >= 11）
            fsd_level = current.fsdLevel or 0
            rating = current.rating or 0
            if fsd_level < 1 and rating < 11:
                return _fail(403, "仅管制员（OBS 及以上）可报名管制席位")
            # 校验所选席位是否属于该活动的管制席位，并自动填充呼号/频率
            if position:
                matched = None
                try:
                    atc_positions = json.loads(event.get("atcPositions") or "[]")
                    if isinstance(atc_positions, list):
                        for item in atc_positions:
                            if isinstance(item, dict) and (
                                (item.get("callsign") or item.get("type")) == position
                            ):
                                matched = item
                                break
                except Exception:  # noqa: BLE001
                    matched = None
                if not matched:
                    return _fail(400, "所选席位不属于该活动")
                saved_callsign = matched.get("callsign") or position
                saved_frequency = matched.get("frequency") or ""

        # 检查是否已报名
        existing = await ev.find_active_registration(db, parsed_id, current.cid, reg_type)
        if existing:
            return _fail(409, "您已报名该活动")

        # 管制员报名时检查席位是否已被占用
        if reg_type == "controller" and position:
            taken = await ev.find_taken_position(db, parsed_id, str(position))
            if taken:
                return _fail(409, "该席位已被报名")

        await ev.create_registration(
            db,
            {
                "eventId": parsed_id,
                "userId": current.cid,
                "type": reg_type,
                "callsign": saved_callsign or callsign or "",
                "aircraft": aircraft or "",
                "position": position or "",
                "frequency": saved_frequency or "",
                "status": ev.STATUS_REGISTERED,
            },
        )

        type_label = "管制员" if reg_type == "controller" else "飞行员"
        await ev.create_notification(
            db,
            current.cid,
            "event",
            f"{type_label}报名成功：{event.get('title')}",
            f"您已成功以{type_label}身份报名「{event.get('title')}」。",
            "/events",
        )
        return _ok(message=f"{type_label}报名成功！")
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


# ==================== DELETE /:id/join 取消报名 ====================
@router.delete("/{event_id}/join")
async def leave_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        parsed_id = _number_param(event_id)
        if parsed_id is None:
            return _fail(500, MESSAGE_OPERATION_FAILED)
        await ev.cancel_registrations(db, parsed_id, current.cid)
        return _ok(message="已取消报名")
    except Exception as exc:  # noqa: BLE001
        log.error("[events.js] %s", exc)
        return _fail(500, MESSAGE_OPERATION_FAILED)


__all__ = ["router"]
