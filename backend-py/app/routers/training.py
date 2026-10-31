"""/api/training 路由（逐接口对齐 Node src/routes/training.js）。

Node 里 `router.use(authenticate)` → 本文件所有端点都需要登录（路由级依赖）。
端点：
  GET  /courses                   课程列表
  POST /courses/{id}/enroll       报名课程
  GET  /records                   我的培训记录
  GET  /exams/{id}                考试详情
  POST /exams/{id}/submit         提交考试
  GET  /schedules                 排班列表
  POST /schedules                 申请值班
"""
from __future__ import annotations

import logging
import math
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, get_current_user
from app.services import training_service as ts
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.training")

router = APIRouter(
    prefix="/training",
    tags=["training"],
    dependencies=[Depends(get_current_user)],  # 对齐 router.use(authenticate)
)

DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


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


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return body if isinstance(body, dict) else {}


def _truthy(value: Any) -> bool:
    """JS 真值语义（空数组/空对象为真）。"""
    if value is None or value is False:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value != ""
    return True


def _js_string(value: Any) -> str:
    """对齐 JS `String(x)`（Node 里用于 date 校验与截断）。"""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _js_number(value: Any) -> Optional[float]:
    """对齐 JS `Number(x)`：null→0，无法解析→None（NaN）。"""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text_value = str(value).strip()
    if text_value == "":
        return 0.0
    try:
        return float(text_value)
    except (TypeError, ValueError):
        return None


def _as_int_id(value: Any) -> Optional[int]:
    """`Number(req.params.id)` → int；非整数按 Prisma 校验失败处理（Node 走 500 分支）。"""
    number = _js_number(value)
    if number is None or not math.isfinite(number) or not float(number).is_integer():
        return None
    return int(number)


def _event_id(value: Any) -> Optional[int]:
    """`Number(req.body.eventId) || 0`；非整数 → None（Prisma Int 校验失败 → 500）。"""
    number = _js_number(value)
    if number is None or number == 0:
        return 0
    if not math.isfinite(number) or not float(number).is_integer():
        return None
    return int(number)


# ==================== 课程 ====================
@router.get("/courses")
async def list_courses(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    """课程列表（Node L9）。"""
    try:
        return _ok(await ts.list_courses(db))
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("/courses/{course_id}/enroll")
async def enroll_course(
    course_id: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    """报名课程（Node L17）。"""
    try:
        parsed = _as_int_id(course_id)
        if parsed is None:
            return _fail(500, "操作失败")
        existing = await ts.find_record(db, parsed, current.cid)
        if existing:
            return _fail(409, "已报名该课程")
        record = await ts.create_record(db, parsed, current.cid)
        record.setdefault("status", "in_progress")  # Node: data.status = 'in_progress'
        return _ok(record, message="报名成功")
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "操作失败")


# ==================== 培训记录 ====================
@router.get("/records")
async def list_records(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    """我的培训记录（Node L30）。"""
    try:
        return _ok(await ts.list_records(db, current.cid))
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "操作失败")


# ==================== 考试 ====================
@router.get("/exams/{exam_id}")
async def get_exam(exam_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    """考试详情（Node L41）。"""
    try:
        parsed = _as_int_id(exam_id)
        if parsed is None:
            return _fail(500, "查询失败")
        exam = await ts.get_exam(db, parsed)
        if not exam:
            return _fail(404, "考试不存在")
        return _ok(exam)
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "查询失败")


@router.post("/exams/{exam_id}/submit")
async def submit_exam(
    exam_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """提交考试（Node L50）：每题 20 分，>= 60% 通过。"""
    try:
        parsed = _as_int_id(exam_id)
        if parsed is None:
            return _fail(500, "提交失败")
        exam = await ts.get_exam(db, parsed)
        if not exam:
            return _fail(404, "考试不存在")
        body = await _json_body(request)
        return _ok(ts.score_answers(exam, body.get("answers")))
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "提交失败")


# ==================== 排班 ====================
@router.get("/schedules")
async def list_schedules(
    date: str = "",
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """排班列表（Node L70）：date 需匹配 YYYY-MM-DD 才过滤。"""
    try:
        filter_date = date if DATE_RE.fullmatch(date or "") else ""
        rows = await ts.list_schedules(db, filter_date)
        cids = {str(row.get("cid")) for row in rows if row.get("cid")}
        names = await ts.username_map(db, sorted(cids))
        data = [
            {**row, "userId": row.get("cid"), "username": names.get(str(row.get("cid"))) or ""}
            for row in rows
        ]
        return _ok(data)
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "操作失败")


@router.post("/schedules")
async def create_schedule(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
) -> JSJSONResponse:
    """申请值班（Node L88）。"""
    try:
        body = await _json_body(request)
        date = body.get("date")
        position = body.get("position")
        start_time = body.get("startTime")
        end_time = body.get("endTime")
        if (
            not _truthy(date)
            or not _truthy(position)
            or not _truthy(start_time)
            or not _truthy(end_time)
        ):
            return _fail(400, "请填写日期、席位、开始与结束时间")
        if not DATE_RE.fullmatch(_js_string(date)):
            return _fail(400, "日期格式应为 YYYY-MM-DD")

        event_id = _event_id(body.get("eventId"))
        if event_id is None:
            return _fail(500, "操作失败")

        data = await ts.create_schedule(
            db,
            {
                "cid": current.cid,
                "eventId": event_id,
                "date": _js_string(date),
                "position": _js_string(position)[:64],
                "frequency": _js_string(body.get("frequency") or "")[:16],
                "startTime": _js_string(start_time)[:32],
                "endTime": _js_string(end_time)[:32],
                "status": "pending",
            },
        )
        return _ok({**data, "userId": data.get("cid")}, message="申请成功，等待审核")
    except Exception as exc:  # noqa: BLE001
        log.error("[training.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
