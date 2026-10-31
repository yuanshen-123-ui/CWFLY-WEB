"""/api/flightplans 路由（逐接口对齐 Node src/routes/flightplans.js）。

公开：/fsd/boundaries、/fsd/online、/fsd/controllers、/share/:shareId
鉴权：GET /、GET /:id、POST /、POST /:id/fsd-sync、DELETE /:id、POST /simbrief-import
"""
from __future__ import annotations

import logging
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import flightplans as fp
from app.services.fsd_mgmt import notify_fsd
from app.utils.json_compat import JSJSONResponse, js_iso

log = logging.getLogger("cwfly.flightplans")
router = APIRouter(prefix="/flightplans", tags=["flightplans"])

SIMBRIEF_URL = "https://www.simbrief.com/api/xml.fetcher.php?userid={userid}"
SIMBRIEF_TIMEOUT = 20.0


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


def _ms(value: Any) -> int:
    """datetime → 毫秒时间戳（对齐 JS Date.getTime()）。"""
    import datetime as dt
    import time

    if isinstance(value, dt.datetime):
        naive = value.astimezone(dt.timezone.utc).replace(tzinfo=None) if value.tzinfo else value
        return int(naive.replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    return int(time.time() * 1000)


# ==================== 公开接口 ====================
@router.get("/fsd/boundaries")
async def fsd_boundaries(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    """管制区边界。

    TODO(P2): 移植 Node src/services/controllerBoundaries.js（40KB 几何算法）；
    当前与 Node 的异常分支一致返回空数组，前端地图会跳过边界绘制。
    """
    try:
        rows = await fp.list_online_controllers(db)
        if not rows:
            return _ok([])
        return _ok([])
    except Exception:
        return _ok([])


@router.get("/fsd/online")
async def fsd_online(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        rows = await fp.list_online_pilots(db)
        atc_re = re.compile(r"_(CTR|APP|TWR|GND|DEL|FSS)$", re.I)
        data = [
            {
                "callsign": p.get("callsign"),
                "cid": p.get("cid"),
                "realname": p.get("realname"),
                "aircraft": p.get("aircraft") or "",
                "dep": p.get("dep") or "",
                "dest": p.get("dest") or "",
                "route": p.get("route") or "",
                "altitude": int(p.get("altitude") or 0),
                "groundspeed": int(p.get("groundspd") or 0),
                "transponder": int(p.get("transponder") or 0),
                "rating": 0,
                "lat": float(p.get("lat") or 0),
                "lon": float(p.get("lon") or 0),
                "heading": int(p.get("heading") or 0),
                "bank": int(p.get("bank") or 0),
                "pitch": int(p.get("pitch") or 0),
                "trail": [],
                "lastSeen": _ms(p.get("updatedAt")),
                "firstSeen": None,
                "type": "ATC" if atc_re.search(str(p.get("callsign") or "")) else "PILOT",
            }
            for p in rows
        ]
        return _ok(data, source="snapshot")
    except Exception:
        return JSJSONResponse({"success": True, "data": [], "source": "error"})


@router.get("/fsd/controllers")
async def fsd_controllers(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        rows = await fp.list_online_controllers(db)
        data = [
            {
                "callsign": c.get("callsign"),
                "cid": c.get("cid"),
                "realname": c.get("realname"),
                "frequency": f"{float(c['frequency']):.3f}" if c.get("frequency") is not None else "0",
                "facilityType": int(c.get("facilityType") or 0),
                "visualRange": int(c.get("visualRange") or 40),
                "lat": float(c.get("lat") or 0),
                "lon": float(c.get("lon") or 0),
                "lastSeen": _ms(c.get("updatedAt")),
            }
            for c in rows
        ]
        return _ok(data)
    except Exception:
        return JSJSONResponse({"success": True, "data": [], "source": "error"})


@router.get("/share/{share_id}")
async def share_plan(share_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    sid = (share_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9]{4,16}", sid):
        return _fail(400, "分享 ID 格式不正确")
    try:
        plan = await fp.get_plan_by_share(db, sid)
        if not plan:
            return _fail(404, "飞行计划不存在")
        return _ok(plan)
    except Exception as exc:
        log.error("[flightplans.py] %s", exc)
        return _fail(500, "操作失败")


# ==================== 鉴权接口（顺序：具体路由在 /{plan_id} 之前）====================
@router.post("/simbrief-import")
async def simbrief_import(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    simbrief_id = body.get("simbriefId")
    if not simbrief_id:
        return _fail(400, "缺少 SimBrief ID")

    url = SIMBRIEF_URL.format(userid=simbrief_id)
    try:
        async with httpx.AsyncClient(timeout=SIMBRIEF_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(url)
    except Exception as exc:
        log.error("[simbrief] 连接失败: %s", exc)
        return _fail(502, "无法连接 SimBrief，请检查网络后重试")

    if response.status_code >= 400:
        reason = ""
        try:
            m = re.search(r"<status>([^<]*)</status>", response.text)
            reason = m.group(1).strip() if m else ""
        except Exception:
            pass
        if "Unknown UserID" in reason:
            return _fail(404, "SimBrief 用户 ID 无效：请输入 SimBrief 个人页里的数字 User ID（不是用户名或邮箱）")
        if "No flight plan" in reason:
            return _fail(404, "该 SimBrief 账号暂无飞行计划：请先在 SimBrief 官网生成一份 OFP 再导入")
        suffix = f"：{reason}" if reason else ""
        return _fail(502, f"SimBrief 返回异常（HTTP {response.status_code}{suffix}）")

    xml_text = response.text
    if "<OFP" not in xml_text:
        return _fail(404, "未找到该 SimBrief 用户的飞行计划，请确认 User ID")

    def block(tag: str) -> str:
        m = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", xml_text)
        return m.group(1) if m else ""

    def field(tag: str, src: str) -> str:
        m = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", src or "")
        return m.group(1).strip() if m else ""

    general = block("general")
    origin = block("origin")
    destination = block("destination")
    alternate = block("alternate")
    aircraft = block("aircraft")
    times = block("times")
    fp_text = block("flightplan_text")

    def fmt_time(epoch: str) -> str:
        try:
            import datetime as dt

            t = dt.datetime.fromtimestamp(int(float(epoch)), tz=dt.timezone.utc)
            return t.strftime("%H%M")
        except Exception:
            return ""

    def fmt_dur(sec: str) -> str:
        try:
            s = int(float(sec))
            if s <= 0:
                return ""
            return f"{s // 3600}:{(s % 3600) // 60:02d}"
        except Exception:
            return ""

    import random

    callsign = (
        field("callsign", fp_text)
        or field("callsign", xml_text)
        or f"CSN{random.randint(1000, 9999)}"
    ).upper()
    aircraft_code = (field("icao_code", aircraft) or field("icaocode", aircraft) or "A320").upper()
    dep_icao = field("icao_code", origin).upper()
    arr_icao = field("icao_code", destination).upper()
    alternate_icao = field("icao_code", alternate).upper()
    dep_time = fmt_time(field("est_out", times) or field("sched_out", times))
    cruise_alt = field("initial_altitude", general)
    cruise_speed = field("cruise_tas", general)
    route = field("route", general)
    flight_time = fmt_dur(field("est_time_enroute", times))
    endurance = fmt_dur(field("endurance", times))
    flight_type = (field("flight_type", fp_text) or field("flight_type", xml_text) or "I").upper()
    equipment = field("equip", aircraft) or field("equipment", aircraft)

    if not dep_icao or not arr_icao:
        return _fail(404, "SimBrief 计划缺少起降机场，可能未生成完整 OFP")

    try:
        plan = await fp.create_plan(
            db,
            {
                "userId": current.cid,
                "callsign": callsign,
                "flightType": "VFR" if flight_type == "V" else "IFR",
                "aircraft": aircraft_code,
                "equipment": equipment,
                "transponder": "",
                "depIcao": dep_icao,
                "depTime": dep_time,
                "cruiseAlt": cruise_alt,
                "cruiseSpeed": cruise_speed,
                "arrIcao": arr_icao,
                "alternate": alternate_icao,
                "flightTime": flight_time,
                "endurance": endurance,
                "route": route,
                "shareId": fp.generate_share_id(),
                "filedAt": fp.zh_now_string(),
                "syncFsd": False,
            },
        )
        return _ok(plan, message="已从 SimBrief 导入")
    except Exception as exc:
        log.error("[simbrief] 入库失败: %s", exc)
        return _fail(500, "SimBrief 导入失败")


@router.get("")
async def list_my_plans(
    db: AsyncSession = Depends(get_db), current: CurrentUser = Depends(get_current_user)
) -> JSJSONResponse:
    try:
        return _ok(await fp.list_plans(db, current.cid))
    except Exception:
        return _fail(500, "查询失败")


@router.post("")
async def submit_plan(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        raw = await request.json()
    except Exception as body_exc:  # noqa: BLE001
        log.error("[flightplans] body 解析失败: %s", body_exc)
        raw = {}
    P = fp.FP_PATTERNS
    clean = fp.clean_field

    callsign = clean(raw.get("callsign"), P["callsign"])
    flight_type = clean(raw.get("flightType"), P["flightType"]) or "IFR"
    aircraft = clean(raw.get("aircraft"), P["aircraft"])
    wake_category = clean(raw.get("wakeCategory"), P["wakeCategory"])
    equipment = clean(raw.get("equipment"), P["equipment"])
    wake = wake_category.upper()
    fsd_aircraft = aircraft.upper() + (("/" + wake) if wake and wake != "M" else "")
    transponder = clean(raw.get("transponder"), P["transponder"])
    dep_icao = clean(raw.get("depIcao"), P["depIcao"])
    dep_time = clean(raw.get("depTime"), P["depTime"])
    cruise_alt = clean(raw.get("cruiseAlt"), P["cruiseAlt"])
    cruise_speed = clean(raw.get("cruiseSpeed"), P["cruiseSpeed"])
    arr_icao = clean(raw.get("arrIcao"), P["arrIcao"])
    alternate = clean(raw.get("alternate"), P["alternate"])
    flight_time = clean(raw.get("flightTime"), P["flightTime"])
    endurance = clean(raw.get("endurance"), P["endurance"])
    route = clean(raw.get("route"), P["route"])
    remarks = clean(raw.get("remarks"), P["remarks"])

    if not callsign or not dep_icao or not arr_icao:
        return _fail(400, "请填写呼号、起降机场")

    plan_data = {
        "userId": current.cid,
        "callsign": callsign.upper(),
        "flightType": flight_type.upper(),
        "aircraft": fsd_aircraft,
        "wakeCategory": wake_category.upper(),
        "equipment": equipment.upper(),
        "transponder": transponder.upper(),
        "depIcao": dep_icao.upper(),
        "depTime": dep_time,
        "cruiseAlt": cruise_alt,
        "cruiseSpeed": cruise_speed,
        "arrIcao": arr_icao.upper(),
        "alternate": alternate.upper(),
        "flightTime": flight_time,
        "endurance": endurance,
        "route": route,
        "remarks": remarks,
        "filedAt": fp.zh_now_string(),
        "syncFsd": False,
    }

    try:
        # 30 分钟内重复提交：覆盖最近一条，保留原 shareId
        last_plan = await fp.get_latest_plan(db, current.cid)
        if last_plan and last_plan.get("filedAt"):
            try:
                import datetime as dt

                last_time = dt.datetime.strptime(str(last_plan["filedAt"]), "%Y/%m/%d %H:%M:%S")
                within = (dt.datetime.now() - last_time).total_seconds() < 30 * 60
            except Exception:
                within = False
            if within:
                plan = await fp.update_plan(
                    db, int(last_plan["id"]), {**plan_data, "shareId": last_plan.get("shareId")}
                )
                if await notify_fsd("add", callsign.upper()):
                    await fp.set_sync_fsd(db, int(plan["id"]), True)
                    plan["syncFsd"] = True
                return _ok(plan, overwritten=True)

        plan = await fp.create_plan(db, {**plan_data, "shareId": fp.generate_share_id()})
        if await notify_fsd("add", callsign.upper()):
            await fp.set_sync_fsd(db, int(plan["id"]), True)
            plan["syncFsd"] = True
        return _ok(plan)
    except Exception as exc:
        log.error("[flightplans.py] POST 提交失败: %s", exc)
        return _fail(500, "提交失败")


@router.post("/{plan_id}/fsd-sync")
async def fsd_sync(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        plan = await fp.get_plan_by_id(db, plan_id)
        if not plan:
            return _fail(404, "飞行计划不存在")
        if str(plan.get("userId")) != str(current.cid):
            return _fail(403, "无权操作此计划")
        await fp.set_sync_fsd(db, plan_id, False)
        return JSJSONResponse({"success": True, "message": "已加入广播队列"})
    except Exception:
        return _fail(500, "操作失败")


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        plan = await fp.get_plan_by_id(db, plan_id)
        if not plan:
            return _fail(404, "飞行计划不存在")
        if str(plan.get("userId")) != str(current.cid):
            return _fail(403, "无权删除此计划")
        await fp.delete_plan(db, plan_id)
        try:
            await notify_fsd("del", plan.get("callsign") or "")
        except Exception:
            pass
        return JSJSONResponse({"success": True, "message": "飞行计划已删除"})
    except Exception:
        return _fail(500, "删除失败")


@router.get("/{plan_id}")
async def get_plan_detail(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    try:
        plan = await fp.get_plan(db, plan_id, current.cid)
        if not plan:
            return _fail(404, "飞行计划不存在")
        return _ok(plan)
    except Exception:
        return _fail(500, "查询失败")


__all__ = ["router", "js_iso"]
