"""培训 / 考试 / 排班数据访问（原生 SQL，列名与 prisma/schema.prisma 一致）。

对应 Node `src/routes/training.js` 里对 `prisma.trainingCourse / trainingRecord /
TrainingExam / controllerSchedule / user` 的调用。
"""
from __future__ import annotations

import datetime as dt
import json
from typing import Any, Optional, Sequence

from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

# ===== 列清单（顺序与 Prisma 模型一致，保证 JSON 字段顺序对齐）=====
COURSE_COLUMNS = "`id`, `title`, `description`, `category`, `content`, `status`, `createdAt`"
RECORD_COLUMNS = "`id`, `userId`, `courseId`, `examId`, `score`, `passed`, `completed`, `createdAt`"
EXAM_COLUMNS = "`id`, `title`, `courseId`, `questions`, `passingScore`"
SCHEDULE_COLUMNS = (
    "`id`, `eventId`, `cid`, `date`, `position`, `frequency`, `startTime`, `endTime`, `status`"
)


# ===== 类型转换 =====
def as_bool(value: Any) -> bool:
    """MySQL Boolean（0/1）→ Python bool（对齐 Prisma Boolean 的 JSON true/false）。"""
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, (bytes, bytearray)):
        return value not in (b"", b"0", b"\x00")
    if isinstance(value, str):
        return value not in ("", "0")
    return bool(value)


def normalize_course(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def normalize_record(row: Any) -> dict[str, Any]:
    data = dict(row._mapping)
    for key in ("passed", "completed"):
        if key in data:
            data[key] = as_bool(data[key])
    return data


def normalize_exam(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def normalize_schedule(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


def parse_questions(raw: Any) -> list[Any]:
    """`questions` 列是 JSON 字符串；解析为列表用于判分（对齐 Node `exam.questions`）。"""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8")
        except Exception:
            return []
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def js_strict_equal(left: Any, right: Any) -> bool:
    """对齐 JS `===`：类型不同即不相等（数字之间可比）。"""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if left is None or right is None:
        return left is None and right is None
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if isinstance(left, str) and isinstance(right, str):
        return left == right
    return left is right


# ===== 课程 =====
async def list_courses(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(text(f"SELECT {COURSE_COLUMNS} FROM `TrainingCourse` ORDER BY `id` DESC"))
    ).all()
    return [normalize_course(r) for r in rows]


# ===== 培训记录 =====
async def find_record(
    db: AsyncSession, course_id: int, user_id: str
) -> Optional[dict[str, Any]]:
    """对齐 `prisma.trainingRecord.findFirst({ where: { courseId, userId } })`。"""
    row = (
        await db.execute(
            text(
                f"SELECT {RECORD_COLUMNS} FROM `TrainingRecord` "
                "WHERE `courseId` = :courseId AND `userId` = :userId ORDER BY `id` ASC LIMIT 1"
            ),
            {"courseId": course_id, "userId": user_id},
        )
    ).first()
    return normalize_record(row) if row else None


async def create_record(
    db: AsyncSession, course_id: int, user_id: str
) -> dict[str, Any]:
    """创建培训记录（status 列不存在于 Prisma 模型，故仅写真实列）。"""
    payload = {
        "userId": user_id,
        "courseId": course_id,
        "examId": 0,
        "score": 0,
        "passed": 0,
        "completed": 0,
        "createdAt": dt.datetime.utcnow(),
    }
    result = await db.execute(
        text(
            "INSERT INTO `TrainingRecord` "
            "(`userId`, `courseId`, `examId`, `score`, `passed`, `completed`, `createdAt`) "
            "VALUES (:userId, :courseId, :examId, :score, :passed, :completed, :createdAt)"
        ),
        payload,
    )
    await db.commit()
    record_id = int(getattr(result, "lastrowid", 0) or 0)
    row = (
        await db.execute(
            text(f"SELECT {RECORD_COLUMNS} FROM `TrainingRecord` WHERE `id` = :id LIMIT 1"),
            {"id": record_id},
        )
    ).first()
    if row is not None:
        return normalize_record(row)
    return {"id": record_id, **{k: payload[k] for k in ("userId", "courseId", "examId", "score", "passed", "completed", "createdAt")}}


async def list_records(db: AsyncSession, user_id: str) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            text(
                f"SELECT {RECORD_COLUMNS} FROM `TrainingRecord` "
                "WHERE `userId` = :userId ORDER BY `id` DESC"
            ),
            {"userId": user_id},
        )
    ).all()
    return [normalize_record(r) for r in rows]


# ===== 考试 =====
async def get_exam(db: AsyncSession, exam_id: int) -> Optional[dict[str, Any]]:
    """对齐 `prisma.trainingExam.findUnique({ where: { id } })`（Node 写成 prisma.exam）。"""
    row = (
        await db.execute(
            text(f"SELECT {EXAM_COLUMNS} FROM `TrainingExam` WHERE `id` = :id LIMIT 1"),
            {"id": exam_id},
        )
    ).first()
    return normalize_exam(row) if row else None


def score_answers(exam: dict[str, Any], answers: Any) -> dict[str, Any]:
    """判分：每题 20 分，`score >= total * 0.6` 通过（公式与 Node 完全一致）。"""
    questions = parse_questions(exam.get("questions"))
    score = 0
    if isinstance(answers, list):
        for index, answer in enumerate(answers):
            if index >= len(questions):
                break
            question = questions[index]
            correct = question.get("correctIndex") if isinstance(question, dict) else None
            if js_strict_equal(answer, correct):
                score += 20
    total = len(questions) * 20
    return {"score": score, "passed": score >= total * 0.6, "total": total}


# ===== 排班 =====
async def list_schedules(db: AsyncSession, date: str = "") -> list[dict[str, Any]]:
    """`date` 为空串则不过滤（对齐 Node `date ? { date } : {}`）。"""
    if date:
        rows = (
            await db.execute(
                text(
                    f"SELECT {SCHEDULE_COLUMNS} FROM `ControllerSchedule` WHERE `date` = :date "
                    "ORDER BY `date` ASC, `startTime` ASC"
                ),
                {"date": date},
            )
        ).all()
    else:
        rows = (
            await db.execute(
                text(
                    f"SELECT {SCHEDULE_COLUMNS} FROM `ControllerSchedule` "
                    "ORDER BY `date` ASC, `startTime` ASC"
                )
            )
        ).all()
    return [normalize_schedule(r) for r in rows]


async def username_map(db: AsyncSession, cids: Sequence[str]) -> dict[str, str]:
    """`prisma.user.findMany({ where: { cid: { in: cids } }, select: { cid, username } })`。"""
    ids = [str(c) for c in cids if c]
    if not ids:
        return {}
    stmt = text("SELECT `cid`, `username` FROM `User` WHERE `cid` IN :cids").bindparams(
        bindparam("cids", expanding=True)
    )
    rows = (await db.execute(stmt, {"cids": ids})).all()
    result: dict[str, str] = {}
    for row in rows:
        mapping = row._mapping
        result[str(mapping["cid"])] = mapping["username"]
    return result


async def create_schedule(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "eventId": int(data.get("eventId") or 0),
        "cid": str(data.get("cid") or ""),
        "date": str(data.get("date") or ""),
        "position": str(data.get("position") or ""),
        "frequency": str(data.get("frequency") or ""),
        "startTime": str(data.get("startTime") or ""),
        "endTime": str(data.get("endTime") or ""),
        "status": str(data.get("status") or "pending"),
    }
    result = await db.execute(
        text(
            "INSERT INTO `ControllerSchedule` "
            "(`eventId`, `cid`, `date`, `position`, `frequency`, `startTime`, `endTime`, `status`) "
            "VALUES (:eventId, :cid, :date, :position, :frequency, :startTime, :endTime, :status)"
        ),
        payload,
    )
    await db.commit()
    schedule_id = int(getattr(result, "lastrowid", 0) or 0)
    row = (
        await db.execute(
            text(f"SELECT {SCHEDULE_COLUMNS} FROM `ControllerSchedule` WHERE `id` = :id LIMIT 1"),
            {"id": schedule_id},
        )
    ).first()
    if row is not None:
        return normalize_schedule(row)
    return {"id": schedule_id, **payload}


__all__ = [
    "COURSE_COLUMNS",
    "RECORD_COLUMNS",
    "EXAM_COLUMNS",
    "SCHEDULE_COLUMNS",
    "as_bool",
    "normalize_course",
    "normalize_record",
    "normalize_exam",
    "normalize_schedule",
    "parse_questions",
    "js_strict_equal",
    "list_courses",
    "find_record",
    "create_record",
    "list_records",
    "get_exam",
    "score_answers",
    "list_schedules",
    "username_map",
    "create_schedule",
]
