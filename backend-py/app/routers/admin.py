"""/api/admin 路由（逐端点对齐 Node src/routes/admin.js，80 个端点）。

鉴权链（与 Node 完全一致）：
    authenticate → adminLimiter(30/min) → requireAdminAccess
                         ↓
                  逐端点 requirePermission('user'|...) / requireRating(11|12)

Node 的 `router.use(authenticate)` + `router.use(adminLimiter)` +
`router.use(requireAdminAccess)` 在这里由单一依赖 `admin_guard` 完成，
保证「先鉴权 → 再限流 → 再判后台权限」的顺序与 Express 中间件顺序一致。

响应结构、状态码、中文文案逐字对齐 Node（含 `fsdType` 这类 Node 会因
`undefined` 而被 JSON.stringify 丢弃的字段：这里主动不输出）。
"""
from __future__ import annotations

import datetime as dt
import functools
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
from pathlib import Path
from typing import Any, Iterable, Optional

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import AuthFailure, CurrentUser, get_current_user, require_permission, require_rating
from app.middleware.rate_limit import Limit, RateLimitExceeded, rate_limiter
from app.services import mailer
from app.services.device_fp import ban_device_fp, ban_user_devices, refresh_device_bans
from app.services.ip_ban_store import normalize_ip, refresh_bans, refresh_ip_list
from app.services.mailer_templates import (
    escape_html_admin,
    send_interview_invite,
    send_notification_ex,
    send_review_result,
)
from app.utils.json_compat import JSJSONResponse
from app.utils.security import has_any_permission, hash_password, perms_to_string, sha256_hex

log = logging.getLogger("cwfly.admin")

router = APIRouter(prefix="/admin", tags=["admin"])

# ==================== 常量（对齐 Node） ====================
# 管理后台限流: 每 IP 每分钟最多 30 次请求（src/routes/security.js adminLimiter）
ADMIN_LIMIT = Limit("admin", 60, 30, "请求过于频繁")
_admin_rate = rate_limiter(ADMIN_LIMIT)

PERM_USER = "user"
PERM_FLIGHTPLAN = "flightplan"
PERM_EVENT = "event"
PERM_CONTROLLER = "controller"
PERM_STAFF = "staff"
PERM_TICKET = "ticket"
PERM_ONLINE = "online"

RATING_NAME: dict[int, str] = {
    0: "普通用户",
    8: "协管员",
    9: "高级协管员",
    11: "管理员",
    12: "超级管理员",
}
FSD_NAME: dict[int, str] = {
    0: "飞行员",
    1: "OBS",
    2: "S1",
    3: "S2",
    4: "S3",
    5: "C1",
    6: "C2",
    7: "C3",
    8: "I1",
    9: "I2",
    10: "I3",
    11: "SUP",
    12: "ADM",
}

POSTER_DIR = Path(__file__).resolve().parents[2] / "uploads" / "posters"
AIRPORT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
POSTER_MAX_BYTES = 5 * 1024 * 1024
POSTER_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"

# Prisma 生成的 client 只 select 模型里声明的字段（node_modules/.prisma/client/schema.prisma），
# 不会返回数据库里多出来的列（例如 `User`.`role`/`salt`、`FlightPlan`.`status`）。
# 这里用同样的字段清单与字段顺序拼 SELECT，保证响应 JSON 与 Node 逐字段一致。
COLUMNS: dict[str, str] = {
    "User": (
        "`id`, `cid`, `username`, `password`, `email`, `qq`, `avatar`, `rating`, `permissions`, "
        "`fsdLevel`, `fsdPasswordHash`, `bgImage`, `resetCode`, `resetCodeExpires`, `createdAt`, "
        "`registerIp`, `registerFp`, `registerUserAgent`"
    ),
    "LoginLog": (
        "`id`, `userId`, `ip`, `userAgent`, `success`, `createdAt`, `deviceFp`, `type`, `failReason`"
    ),
    "AuditLog": "`id`, `userId`, `action`, `target`, `detail`, `createdAt`",
    "IpVisit": (
        "`id`, `ip`, `windowStart`, `count`, `firstSeen`, `lastSeen`, `deviceFp`"
    ),
    "IpBan": "`id`, `ip`, `reason`, `bannedBy`, `bannedUser`, `active`, `expiresAt`, `createdAt`",
    "IpList": "`id`, `ip`, `type`, `reason`, `addedBy`, `active`, `createdAt`",
    "IpGroup": "`id`, `name`, `type`, `reason`, `addedBy`, `active`, `createdAt`",
    "IpGroupMember": "`id`, `groupId`, `ip`, `createdAt`",
    "DeviceBan": "`id`, `fp`, `reason`, `bannedBy`, `bannedAt`",
    "UserChangeApproval": (
        "`id`, `cid`, `username`, `action`, `ips`, `reason`, `requestedBy`, `status`, `createdAt`, "
        "`reviewedAt`, `reviewedBy`"
    ),
    "Announcement": "`id`, `title`, `content`, `publisher`, `time`, `pinned`",
    "Application": (
        "`id`, `userId`, `name`, `type`, `department`, `reason`, `status`, `time`, `interviewTime1`, "
        "`interviewTime2`, `reviewComment`, `reviewedBy`"
    ),
    "Staff": "`cid`, `name`, `department`, `position`, `rating`, `active`, `online`",
    "Event": (
        "`id`, `title`, `date`, `time`, `dep`, `arr`, `route`, `publisher`, `distance`, `notams`, "
        "`atcPositions`, `desc`, `poster`, `status`"
    ),
    "EventRegistration": (
        "`id`, `eventId`, `userId`, `type`, `callsign`, `aircraft`, `position`, `frequency`, "
        "`status`, `createdAt`, `updatedAt`"
    ),
    "FlightPlan": (
        "`id`, `userId`, `callsign`, `flightType`, `aircraft`, `wakeCategory`, `equipment`, "
        "`transponder`, `depIcao`, `depTime`, `cruiseAlt`, `cruiseSpeed`, `arrIcao`, `alternate`, "
        "`flightTime`, `endurance`, `route`, `remarks`, `shareId`, `filedAt`, `syncFsd`"
    ),
    "Ticket": (
        "`id`, `userId`, `title`, `category`, `priority`, `content`, `status`, `assignee`, `reply`, "
        "`createdAt`, `updatedAt`"
    ),
    "Notification": "`id`, `userId`, `type`, `title`, `content`, `link`, `read`, `createdAt`",
    "TrainingCourse": "`id`, `title`, `description`, `category`, `content`, `status`, `createdAt`",
    "TrainingRecord": (
        "`id`, `userId`, `courseId`, `examId`, `score`, `passed`, `completed`, `createdAt`"
    ),
    "Achievement": "`id`, `name`, `description`, `icon`, `criteria`, `condition`",
    "SystemConfig": "`id`, `key`, `value`",
}


def sel(table: str, tail: str = "") -> str:
    """`SELECT <Prisma 字段表> FROM <table> [tail]`。"""
    suffix = f" {tail}" if tail else ""
    return f"SELECT {COLUMNS[table]} FROM `{table}`{suffix}"


# ==================== 响应 / 工具 ====================
def _ok(data: Any = None, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True, "data": data}
    body.update(extra)
    return JSJSONResponse(body)


def _fail(status_code: int, message: str, **extra: Any) -> JSJSONResponse:
    body: dict[str, Any] = {"success": False, "message": message}
    body.update(extra)
    return JSJSONResponse(body, status_code=status_code)


def handle(message: str = "操作失败"):  # noqa: ANN201 - 装饰器工厂
    """把 handler 内未捕获异常转成 Node 风格 500 `{"success":false,"message":...}`。

    Node 的 admin 路由几乎每个 handler 都是 `try { ... } catch { 500 }`，
    错误文案分别为「操作失败」「query failed」。依赖（鉴权/限流）抛出的
    AuthFailure / RateLimitExceeded 必须原样上抛，交给 main.py 的异常处理器。
    """

    def decorator(func):  # noqa: ANN001, ANN202
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any):  # noqa: ANN202
            try:
                return await func(*args, **kwargs)
            except (AuthFailure, RateLimitExceeded):
                raise
            except Exception as exc:  # noqa: BLE001
                log.error("[admin.py] %s: %s", getattr(func, "__name__", "?"), exc)
                return _fail(500, message)

        return wrapper

    return decorator


async def admin_guard(
    request: Request,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """等价 Node：authenticate → adminLimiter → requireAdminAccess。"""
    await _admin_rate(request, response)
    if (user.rating or 0) >= 8 and has_any_permission(
        {"rating": user.rating, "permissions": user.permissions}
    ):
        return user
    raise AuthFailure(403, "权限不足，无法访问管理后台")


async def _body(request: Request) -> dict[str, Any]:
    """等价 Express `req.body`（无 body / 非 JSON 时为 {}）。"""
    try:
        raw = await request.json()
    except Exception:  # noqa: BLE001
        return {}
    return raw if isinstance(raw, dict) else {}


def _utcnow() -> dt.datetime:
    return dt.datetime.utcnow()


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms(value: Any) -> int:
    """datetime → 毫秒时间戳（对齐 JS Date.getTime()）。"""
    if isinstance(value, dt.datetime):
        naive = value.astimezone(dt.timezone.utc).replace(tzinfo=None) if value.tzinfo else value
        return int(naive.replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    return 0


def _zh(value: Any) -> str:
    """对齐 JS `new Date(x).toLocaleString('zh-CN')`（本地时区，月/日不补零）。"""
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        base = value.replace(tzinfo=dt.timezone.utc) if value.tzinfo is None else value
        local = base.astimezone()
        return (
            f"{local.year}/{local.month}/{local.day} "
            f"{local.hour:02d}:{local.minute:02d}:{local.second:02d}"
        )
    if isinstance(value, str):
        return value
    return ""


def _row(row: Any, bool_cols: Iterable[str] = ()) -> dict[str, Any]:
    """Result row → dict（布尔列 0/1 → true/false，保持 SELECT 的列顺序）。"""
    data = dict(row._mapping)
    for column in bool_cols:
        if column in data and data[column] is not None:
            data[column] = bool(data[column])
    return data


def _rows(rows: Iterable[Any], bool_cols: Iterable[str] = ()) -> list[dict[str, Any]]:
    return [_row(row, bool_cols) for row in rows]


def _as_int(value: Any) -> int:
    """对齐 JS `Number(x)`（NaN/Infinity 视为非法，抛错 → 500）。"""
    if value is None:
        raise ValueError("invalid number")
    if isinstance(value, bool):
        return int(value)
    text_value = str(value).strip()
    if text_value == "":
        return 0
    number = float(text_value)
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError("invalid number")
    return int(number)


def _paging(page: Any, page_size: Any) -> tuple[int, int]:
    """返回 (skip, take)：Node `(Number(page)-1)*Number(pageSize), Number(pageSize)`。"""
    take = _as_int(page_size)
    skip = (_as_int(page) - 1) * take
    if skip < 0:
        raise ValueError("negative skip")
    return skip, take


def _rating_name(value: Any) -> str:
    key = _maybe_int(value)
    if key is not None and key in RATING_NAME:
        return RATING_NAME[key]
    return "" if value is None else str(value)


def _fsd_name(value: Any) -> str:
    key = _maybe_int(value)
    if key is not None and key in FSD_NAME:
        return FSD_NAME[key]
    return "" if value is None else str(value)


def _maybe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def _perms_to_string(value: Any) -> str:
    """对齐 Node `permsToString(permissions)`。

    Node 对非数组入参（例如直接传字符串）会按字符迭代 → 结果为 ''。
    """
    if isinstance(value, str):
        items: list[str] = list(value)
    elif isinstance(value, (list, tuple, set, frozenset)):
        items = [str(item) for item in value]
    else:
        items = []
    return perms_to_string(items)


def generate_random_password(length: int = 12) -> str:
    """随机强密码（12 位，去除易混淆字符 0/O/1/l）。"""
    return "".join(secrets.choice(PASSWORD_CHARS) for _ in range(length))


async def _write_audit(db: AsyncSession, action: str, detail: str, operator: str) -> None:
    """对齐 Node `writeAudit`：写失败静默，不影响主流程。"""
    try:
        await db.execute(
            text(
                "INSERT INTO `AuditLog` (`userId`, `action`, `target`, `detail`) "
                "VALUES (:uid, :action, :target, :detail)"
            ),
            {
                "uid": operator or "system",
                "action": action,
                "target": detail[:200],
                "detail": detail,
            },
        )
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        log.warning("[admin.py] writeAudit 失败: %s", exc)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass


def _pending_visits() -> list[dict[str, Any]]:
    """Node 从 `middleware/ipTracker.js` 取「未落库的实时访问」并合并进网络日志。

    Python 端尚未移植 ipTracker（中间件/服务属既有文件范围），因此这里返回空列表：
    仅缺少「最近 60s 内存中尚未落库」的实时行，已落库的 IpVisit 行不受影响。
    """
    return []


async def _notify_all_users(db: AsyncSession, title: str, content: str) -> None:
    """对齐 Node 公告创建后给所有用户建通知（失败静默）。"""
    try:
        rows = (await db.execute(text("SELECT `cid` FROM `User`"))).all()
        payload = [
            {
                "uid": str(row._mapping["cid"]),
                "title": title,
                "content": content[:200],
                "link": "/announcements",
            }
            for row in rows
        ]
        if payload:
            await db.execute(
                text(
                    "INSERT INTO `Notification` (`userId`, `type`, `title`, `content`, `link`, `read`) "
                    "VALUES (:uid, 'announcement', :title, :content, :link, 0)"
                ),
                payload,
            )
            await db.commit()
    except Exception:  # noqa: BLE001
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass


# ==================== 用户管理 ====================
@router.get("/users")
@handle()
async def list_users(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(
            text(
                "SELECT `id`, `cid`, `username`, `rating`, `permissions`, `fsdLevel`, "
                "`createdAt`, `registerIp` FROM `User` ORDER BY `id` ASC"
            )
        )
    ).all()
    logs = (
        await db.execute(
            text(
                "SELECT `userId`, `ip`, `deviceFp`, `createdAt` FROM `LoginLog` "
                "ORDER BY `createdAt` DESC"
            )
        )
    ).all()
    last_login: dict[str, dict[str, Any]] = {}
    for entry in logs:
        mapping = entry._mapping
        uid = str(mapping.get("userId") or "")
        if uid and uid not in last_login:
            last_login[uid] = {
                "ip": mapping.get("ip"),
                "time": mapping.get("createdAt"),
                "fp": mapping.get("deviceFp"),
            }
    data: list[dict[str, Any]] = []
    for item in rows:
        record = dict(item._mapping)
        cid = str(record.get("cid") or "")
        hit = last_login.get(cid)
        data.append(
            {
                **record,
                "registerIp": record.get("registerIp") or "",
                "lastLoginIp": (hit or {}).get("ip") or "",
                "lastLoginFp": (hit or {}).get("fp") or "",
                "lastLoginAt": _zh((hit or {}).get("time")) if (hit or {}).get("time") else "",
            }
        )
    return _ok(data)


@router.put("/users/{cid}")
@handle()
async def update_user(
    cid: str,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    _rating: CurrentUser = Depends(require_rating(11)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    username = body.get("username")
    rating = body.get("rating")
    permissions = body.get("permissions")
    fsd_level = body.get("fsdLevel")
    password = body.get("password")
    password_reason = body.get("passwordReason")

    me_rating = current.rating or 0
    old_row = (
        await db.execute(text(sel("User", "WHERE `cid` = :cid")), {"cid": cid})
    ).first()
    if old_row is None:
        return _fail(404, "not found")
    old_user = _row(old_row)

    new_permissions = _perms_to_string(permissions) if permissions is not None else None
    # 非超管权限保护
    if me_rating < 12:
        target_rating = _maybe_int(rating) if rating is not None else _maybe_int(old_user.get("rating"))
        if target_rating is not None and target_rating >= 11:
            return _fail(403, "您没有权限将用户提升至管理员或超级管理员")
        old_rating = _maybe_int(old_user.get("rating")) or 0
        if old_rating >= 11:
            return _fail(403, "您没有权限编辑管理员及以上等级的用户")

    updates: dict[str, Any] = {}
    if username is not None:
        updates["username"] = username
    if rating is not None:
        updates["rating"] = rating
    if permissions is not None:
        updates["permissions"] = new_permissions
    if fsd_level is not None:
        updates["fsdLevel"] = fsd_level

    password_set = password is not None and password != ""
    if password_set:
        candidate = str(password)
        if len(candidate) < 6:
            return _fail(400, "密码长度不能少于 6 位")
        updates["password"] = hash_password(candidate)
        updates["fsdPasswordHash"] = sha256_hex(candidate)

    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["cid"] = cid
        await db.execute(
            text(f"UPDATE `User` SET {set_clause} WHERE `cid` = :cid"), params
        )
        await db.commit()

    user_row = (
        await db.execute(text(sel("User", "WHERE `cid` = :cid")), {"cid": cid})
    ).first()
    if user_row is None:
        return _fail(404, "not found")
    user = _row(user_row)

    old_email = old_user.get("email") or ""
    if old_email:
        changes: list[str] = []
        if rating is not None and old_user.get("rating") != rating:
            changes.append("角色：" + _rating_name(old_user.get("rating")) + " -> " + _rating_name(rating))
        if fsd_level is not None and old_user.get("fsdLevel") != fsd_level:
            changes.append(
                "管制等级：" + _fsd_name(old_user.get("fsdLevel")) + " -> " + _fsd_name(fsd_level)
            )
        if permissions is not None and (old_user.get("permissions") or "") != (new_permissions or ""):
            changes.append("权限已更新")
        if changes:
            try:
                mailer.fire_and_forget(
                    send_notification_ex(
                        old_email,
                        {
                            "subject": "账号权限变更",
                            "intro": "您的账号权限已被修改。",
                            "body": "<br>".join(changes),
                            "note": "如果您未预期此变更，请立即联系管理员。",
                        },
                    )
                )
            except Exception:  # noqa: BLE001
                pass
        if password_set:
            reason = "" if password_reason is None else str(password_reason).strip()
            detail = (
                "您的密码由于" + reason + "，已被管理员重置，请尽快登录并修改密码。"
                if reason
                else "您的密码已被管理员重置，请尽快登录并修改密码。"
            )
            try:
                mailer.fire_and_forget(
                    mailer.send_security_alert(
                        old_email,
                        {
                            "action": "密码重置",
                            "detail": detail,
                            "time": _zh(_utcnow()),
                        },
                    )
                )
            except Exception:  # noqa: BLE001
                pass

    if password_set:
        reason = "" if password_reason is None else str(password_reason).strip()
        await _write_audit(
            db,
            "reset_password",
            "User " + cid + " 密码被管理员重置" + (f"（原因：{reason}）" if reason else ""),
            current.cid,
        )
    await _write_audit(db, "edit_user", "User " + cid + " updated", current.cid)

    # 注意：Node 的 `user.fsdType` 不是数据库列 → JSON.stringify 会丢弃该键
    return _ok(
        {
            "cid": user.get("cid"),
            "username": user.get("username"),
            "rating": user.get("rating"),
            "permissions": user.get("permissions") or "",
            "fsdLevel": user.get("fsdLevel"),
        }
    )


@router.delete("/users/{cid}")
@handle()
async def delete_user(
    cid: str,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    _rating: CurrentUser = Depends(require_rating(11)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可直接删除用户，非超管请提交删除审批")
    body = await _body(request)
    ban_device = bool(body.get("banDevice"))

    banned_fps: list[str] = []
    if ban_device:
        banned_fps = await ban_user_devices(cid, "删除用户并封禁设备", current.cid or "system")
        await refresh_device_bans()

    exists = (
        await db.execute(text("SELECT `id` FROM `User` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `User` WHERE `cid` = :cid"), {"cid": cid})
    await db.commit()
    await _write_audit(
        db,
        "delete_user",
        "User " + cid + " deleted" + (f"（同步封禁设备指纹 {len(banned_fps)} 个）" if ban_device else ""),
        current.cid,
    )
    return JSJSONResponse({"success": True, "message": "deleted", "bannedFps": banned_fps})


@router.post("/users/{cid}/reset-password")
@handle()
async def reset_user_password(
    cid: str,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可重置密码")
    old_row = (
        await db.execute(text(sel("User", "WHERE `cid` = :cid")), {"cid": cid})
    ).first()
    if old_row is None:
        return _fail(404, "not found")
    old_user = _row(old_row)
    body = await _body(request)
    reason = str(body.get("reason") or "").strip() if "reason" in body else ""

    random_password = generate_random_password()
    await db.execute(
        text(
            "UPDATE `User` SET `password` = :password, `fsdPasswordHash` = :hash WHERE `cid` = :cid"
        ),
        {"password": hash_password(random_password), "hash": sha256_hex(random_password), "cid": cid},
    )
    await db.commit()

    email = old_user.get("email") or ""
    if email:
        detail = (
            (
                f"您的密码由于{reason}，已被管理员重置，请尽快登录并修改密码。"
                if reason
                else "您的密码已被管理员重置，请尽快登录并修改密码。"
            )
            + f"<br><br>请以 <b>{random_password}</b> 该密码登录并重置您的密码。"
        )
        try:
            mailer.fire_and_forget(
                mailer.send_security_alert(
                    email,
                    {"action": "密码重置", "detail": detail, "time": _zh(_utcnow())},
                )
            )
        except Exception:  # noqa: BLE001
            pass

    await _write_audit(
        db,
        "reset_password",
        "User " + cid + " 密码被管理员重置（随机密码）" + (f"（原因：{reason}）" if reason else ""),
        current.cid,
    )
    return JSJSONResponse(
        {"success": True, "message": "密码已重置并发送给用户", "password": random_password}
    )


# ==================== 设备指纹封禁（仅超管） ====================
@router.get("/device-bans")
@handle()
async def list_device_bans(
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可查看设备封禁")
    rows = (
        await db.execute(text(sel("DeviceBan", "ORDER BY `id` DESC")))
    ).all()
    data = [
        {
            "id": item["id"],
            "fp": item["fp"],
            "reason": item["reason"],
            "bannedBy": item["bannedBy"],
            "bannedAt": _zh(item["bannedAt"]),
        }
        for item in _rows(rows)
    ]
    return _ok(data)


@router.post("/device-bans")
@handle()
async def create_device_ban(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可操作")
    body = await _body(request)
    fp = body.get("fp")
    if not fp:
        return _fail(400, "缺少设备指纹")
    await ban_device_fp(str(fp), str(body.get("reason") or ""), current.cid or "system")
    await refresh_device_bans()
    await _write_audit(db, "ban_device", "封禁设备指纹 " + str(fp)[:40], current.cid)
    return JSJSONResponse({"success": True, "message": "已封禁该设备"})


@router.delete("/device-bans/{ban_id}")
@handle()
async def delete_device_ban(
    ban_id: int,
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可操作")
    exists = (
        await db.execute(text("SELECT `id` FROM `DeviceBan` WHERE `id` = :id"), {"id": ban_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `DeviceBan` WHERE `id` = :id"), {"id": ban_id})
    await db.commit()
    await refresh_device_bans()
    await _write_audit(db, "unban_device", f"解除设备指纹封禁 #{ban_id}", current.cid)
    return JSJSONResponse({"success": True, "message": "已解除"})


# ==================== 用户删除审批 ====================
@router.post("/user-deletion-requests")
@handle()
async def create_deletion_request(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    cid = body.get("cid")
    if not cid:
        return _fail(400, "缺少目标用户 CID")
    kind = "delete_ban" if body.get("action") == "delete_ban" else "delete"
    raw_ips = body.get("ips")
    if isinstance(raw_ips, (list, tuple)):
        ips = ",".join(str(item) for item in raw_ips)
    else:
        ips = str(raw_ips or "")
    now = _utcnow()
    result = await db.execute(
        text(
            "INSERT INTO `UserChangeApproval` "
            "(`cid`, `username`, `action`, `ips`, `reason`, `requestedBy`, `status`, `createdAt`) "
            "VALUES (:cid, :username, :action, :ips, :reason, :requested_by, 'pending', :created_at)"
        ),
        {
            "cid": str(cid),
            "username": str(body.get("username") or ""),
            "action": kind,
            "ips": ips,
            "reason": str(body.get("reason") or ""),
            "requested_by": current.cid or "system",
            "created_at": now,
        },
    )
    await db.commit()
    record = (
        await db.execute(
            text(sel("UserChangeApproval", "WHERE `id` = :id")),
            {"id": result.lastrowid},
        )
    ).first()
    await _write_audit(
        db,
        "request_delete_user",
        "提交删除审批: 用户 " + str(cid) + "（" + ("删除+封禁" if kind == "delete_ban" else "删除") + "）",
        current.cid,
    )
    return _ok(_row(record) if record is not None else None)


@router.get("/user-deletion-requests")
@handle()
async def list_deletion_requests(
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可查看删除审批")
    rows = (
        await db.execute(text(sel("UserChangeApproval", "ORDER BY `id` DESC")))
    ).all()
    items = _rows(rows)
    cids = list(dict.fromkeys([str(item.get("requestedBy") or "") for item in items if item.get("requestedBy")]))
    name_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        name_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}
    formatted = [
        {
            "id": item.get("id"),
            "cid": item.get("cid"),
            "username": item.get("username"),
            "action": item.get("action"),
            "ips": item.get("ips"),
            "reason": item.get("reason"),
            "requestedBy": item.get("requestedBy"),
            "requestedName": name_map.get(str(item.get("requestedBy") or ""), ""),
            "status": item.get("status"),
            "createdAt": _zh(item.get("createdAt")),
            "reviewedAt": _zh(item.get("reviewedAt")) if item.get("reviewedAt") else None,
            "reviewedBy": item.get("reviewedBy"),
        }
        for item in items
    ]
    return _ok(formatted)


@router.post("/user-deletion-requests/{req_id}/approve")
@handle()
async def approve_deletion_request(
    req_id: int,
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可审批")
    row = (
        await db.execute(
            text(sel("UserChangeApproval", "WHERE `id` = :id")), {"id": req_id}
        )
    ).first()
    if row is None:
        return _fail(404, "审批不存在或已处理")
    record = _row(row)
    if record.get("status") != "pending":
        return _fail(404, "审批不存在或已处理")

    operator = current.cid or "system"
    target_cid = str(record.get("cid") or "")
    target_name = str(record.get("username") or "")
    fallback_reason = record.get("reason") or f"删除用户 {target_name}({target_cid})"

    if record.get("action") == "delete_ban":
        banned = await ban_user_devices(target_cid, str(fallback_reason), operator)
        if banned:
            await refresh_device_bans()

    exists = (
        await db.execute(text("SELECT `id` FROM `User` WHERE `cid` = :cid"), {"cid": target_cid})
    ).first()
    if exists is not None:
        await db.execute(text("DELETE FROM `User` WHERE `cid` = :cid"), {"cid": target_cid})
        await db.commit()

    if record.get("action") == "delete_ban" and record.get("ips"):
        for raw in str(record.get("ips")).split(","):
            ip = normalize_ip(raw)
            if not ip:
                continue
            existing = (
                await db.execute(text("SELECT `id` FROM `IpBan` WHERE `ip` = :ip"), {"ip": ip})
            ).first()
            if existing is not None:
                await db.execute(
                    text(
                        "UPDATE `IpBan` SET `active` = 1, `bannedBy` = :by WHERE `id` = :id"
                    ),
                    {"by": operator, "id": existing._mapping["id"]},
                )
            else:
                await db.execute(
                    text(
                        "INSERT INTO `IpBan` (`ip`, `reason`, `bannedBy`, `active`, `createdAt`) "
                        "VALUES (:ip, :reason, :by, 1, :created_at)"
                    ),
                    {
                        "ip": ip,
                        "reason": str(fallback_reason),
                        "by": operator,
                        "created_at": _utcnow(),
                    },
                )
        await db.commit()
        await refresh_bans()

    await db.execute(
        text(
            "UPDATE `UserChangeApproval` SET `status` = 'approved', `reviewedBy` = :by, "
            "`reviewedAt` = :at WHERE `id` = :id"
        ),
        {"by": operator, "at": _utcnow(), "id": req_id},
    )
    await db.commit()
    await _write_audit(
        db,
        "approve_delete_user",
        "批准删除用户 " + target_cid + "（" + str(record.get("action")) + "）",
        current.cid,
    )
    return JSJSONResponse({"success": True, "message": "已批准并执行"})


@router.post("/user-deletion-requests/{req_id}/reject")
@handle()
async def reject_deletion_request(
    req_id: int,
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if (current.rating or 0) < 12:
        return _fail(403, "仅超级管理员可审批")
    row = (
        await db.execute(
            text(sel("UserChangeApproval", "WHERE `id` = :id")), {"id": req_id}
        )
    ).first()
    if row is None:
        return _fail(404, "审批不存在或已处理")
    record = _row(row)
    if record.get("status") != "pending":
        return _fail(404, "审批不存在或已处理")
    await db.execute(
        text(
            "UPDATE `UserChangeApproval` SET `status` = 'rejected', `reviewedBy` = :by, "
            "`reviewedAt` = :at WHERE `id` = :id"
        ),
        {"by": current.cid or "system", "at": _utcnow(), "id": req_id},
    )
    await db.commit()
    await _write_audit(
        db, "reject_delete_user", "拒绝删除用户 " + str(record.get("cid") or ""), current.cid
    )
    return JSJSONResponse({"success": True, "message": "已拒绝"})


# ==================== 公告 ====================
@router.get("/announcements")
@handle()
async def list_announcements(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(
            text(sel("Announcement", "ORDER BY `pinned` DESC, `id` DESC"))
        )
    ).all()
    return _ok(_rows(rows, ("pinned",)))


@router.post("/announcements")
@handle()
async def create_announcement(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    title = body.get("title")
    content = body.get("content")
    if not title or not content:
        return _fail(400, "missing fields")
    publisher = current.username or ""
    day = dt.datetime.utcnow().strftime("%Y-%m-%d")
    result = await db.execute(
        text(
            "INSERT INTO `Announcement` (`title`, `content`, `publisher`, `time`, `pinned`) "
            "VALUES (:title, :content, :publisher, :time, :pinned)"
        ),
        {
            "title": title,
            "content": content,
            "publisher": publisher,
            "time": day,
            "pinned": 1 if body.get("pinned") else 0,
        },
    )
    await db.commit()
    await _write_audit(db, "create_announcement", "Announcement created: " + str(title), current.cid)
    await _notify_all_users(db, str(title), str(content))
    row = (
        await db.execute(
            text(sel("Announcement", "WHERE `id` = :id")), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row, ("pinned",)) if row is not None else None)


# DELETE /applications/staff/:id — 删除职员申请（Node 中定义在公告之间，保持顺序）
@router.delete("/applications/staff/{app_id}")
@handle()
async def delete_staff_application(
    app_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Application` WHERE `id` = :id"), {"id": app_id})
    ).first()
    if exists is None:
        return _fail(404, "申请不存在")
    await db.execute(text("DELETE FROM `Application` WHERE `id` = :id"), {"id": app_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "已删除"})


@router.put("/announcements/{ann_id}")
@handle()
async def update_announcement(
    ann_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    if "title" in body and body["title"] is not None:
        updates["title"] = body["title"]
    if "content" in body and body["content"] is not None:
        updates["content"] = body["content"]
    if "pinned" in body and body["pinned"] is not None:
        updates["pinned"] = 1 if body["pinned"] else 0

    exists = (
        await db.execute(text("SELECT `id` FROM `Announcement` WHERE `id` = :id"), {"id": ann_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = ann_id
        await db.execute(text(f"UPDATE `Announcement` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    await _write_audit(db, "edit_announcement", f"Announcement #{ann_id} updated", current.cid)
    row = (
        await db.execute(text(sel("Announcement", "WHERE `id` = :id")), {"id": ann_id})
    ).first()
    return _ok(_row(row, ("pinned",)) if row is not None else None)


@router.delete("/announcements/{ann_id}")
@handle()
async def delete_announcement(
    ann_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Announcement` WHERE `id` = :id"), {"id": ann_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Announcement` WHERE `id` = :id"), {"id": ann_id})
    await db.commit()
    await _write_audit(db, "delete_announcement", f"Announcement #{ann_id} deleted", current.cid)
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/permissions")
@handle()
async def list_permissions(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
) -> JSJSONResponse:
    return _ok({})


# ==================== 日志（仅超管 rating>=12） ====================
@router.get("/logs/login")
@handle("query failed")
async def logs_login(
    page: str = "1",
    pageSize: str = "20",  # noqa: N803 - 对齐 Node query 名
    current: CurrentUser = Depends(admin_guard),
    _rating: CurrentUser = Depends(require_rating(12)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    rows = (
        await db.execute(
            text(sel("LoginLog", f"ORDER BY `createdAt` DESC LIMIT {take} OFFSET {skip}"))
        )
    ).all()
    total = (
        await db.execute(text("SELECT COUNT(*) AS c FROM `LoginLog`"))
    ).scalar_one()
    items = _rows(rows, ("success",))
    cids = [str(item.get("userId") or "") for item in items if item.get("userId")]
    user_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        user_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}
    formatted = []
    for item in items:
        uid = str(item.get("userId") or "")
        formatted.append(
            {
                "id": item.get("id"),
                "cid": uid or "unknown",
                "username": user_map.get(uid) if uid in user_map else (uid or "unknown"),
                "ip": item.get("ip"),
                "loginLocation": item.get("loginLocation") or "",
                "deviceFp": item.get("deviceFp") or "",
                "type": item.get("type") or "login",
                "failReason": item.get("failReason") or "",
                "userAgent": item.get("userAgent") or "",
                "time": _zh(item.get("createdAt")),
                "success": item.get("success"),
            }
        )
    return _ok({"items": formatted, "total": int(total)})


@router.get("/logs/register")
@handle("query failed")
async def logs_register(
    page: str = "1",
    pageSize: str = "20",  # noqa: N803
    current: CurrentUser = Depends(admin_guard),
    _rating: CurrentUser = Depends(require_rating(12)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    rows = (
        await db.execute(
            text(f"SELECT * FROM `User` ORDER BY `createdAt` DESC LIMIT {take} OFFSET {skip}")
        )
    ).all()
    total = (await db.execute(text("SELECT COUNT(*) AS c FROM `User`"))).scalar_one()
    formatted = [
        {
            "id": item.get("id"),
            "cid": item.get("cid") or "unknown",
            "username": item.get("username") or "unknown",
            "ip": item.get("registerIp") or "",
            "deviceFp": item.get("registerFp") or "",
            "userAgent": item.get("registerUserAgent") or "",
            "time": _zh(item.get("createdAt")) if item.get("createdAt") else "",
            "success": True,
        }
        for item in _rows(rows)
    ]
    return _ok({"items": formatted, "total": int(total)})


@router.get("/logs/network")
@handle("query failed")
async def logs_network(
    page: str = "1",
    pageSize: str = "50",  # noqa: N803
    current: CurrentUser = Depends(admin_guard),
    _rating: CurrentUser = Depends(require_rating(12)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    rows = (
        await db.execute(
            text(
                "SELECT * FROM `IpVisit` ORDER BY `windowStart` DESC, `count` DESC "
                f"LIMIT {take} OFFSET {skip}"
            )
        )
    ).all()
    total = (await db.execute(text("SELECT COUNT(*) AS c FROM `IpVisit`"))).scalar_one()
    items = _rows(rows)

    # 合并 ipTracker 内存中未落库的实时访问（Python 端暂未移植 → 空列表）
    pending = _pending_visits()
    pending_map = {f"{item['ip']}|{_ms(item['windowStart'])}": item for item in pending}
    seen = {f"{item.get('ip')}|{_ms(item.get('windowStart'))}" for item in items}

    formatted: list[dict[str, Any]] = []
    for item in items:
        key = f"{item.get('ip')}|{_ms(item.get('windowStart'))}"
        hit = pending_map.get(key)
        last_seen = hit["last"] if hit else item.get("lastSeen")
        formatted.append(
            {
                "ip": item.get("ip"),
                "deviceFp": (hit or {}).get("fp") or item.get("deviceFp") or "",
                "count": int(item.get("count") or 0) + (int(hit.get("count") or 0) if hit else 0),
                "windowStart": _zh(item.get("windowStart")),
                "lastSeen": _zh(last_seen),
            }
        )
    for item in pending:
        key = f"{item['ip']}|{_ms(item['windowStart'])}"
        if key in seen:
            continue
        formatted.append(
            {
                "ip": item["ip"],
                "deviceFp": item.get("fp") or "",
                "count": item.get("count"),
                "windowStart": _zh(item["windowStart"]),
                "lastSeen": _zh(item["last"]),
            }
        )

    ips = list(dict.fromkeys([str(item["ip"]) for item in formatted if item.get("ip")]))
    login_map: dict[str, list[str]] = {}
    register_map: dict[str, list[str]] = {}
    if ips:
        placeholders = ", ".join(f":ip{index}" for index in range(len(ips)))
        ip_params = {f"ip{index}": value for index, value in enumerate(ips)}
        login_rows = (
            await db.execute(
                text(
                    "SELECT `ip`, `userId` FROM `LoginLog` "
                    f"WHERE `ip` IN ({placeholders}) AND `success` = 1 ORDER BY `createdAt` DESC"
                ),
                ip_params,
            )
        ).all()
        for row in login_rows:
            uid = str(row._mapping.get("userId") or "").strip()
            if not re.fullmatch(r"\d+", uid):
                continue
            bucket = login_map.setdefault(str(row._mapping.get("ip") or ""), [])
            if uid not in bucket:
                bucket.append(uid)
        unmatched = [ip for ip in ips if ip not in login_map]
        if unmatched:
            placeholders = ", ".join(f":ip{index}" for index in range(len(unmatched)))
            reg_params = {f"ip{index}": value for index, value in enumerate(unmatched)}
            user_rows = (
                await db.execute(
                    text(
                        "SELECT `cid`, `registerIp` FROM `User` "
                        f"WHERE `registerIp` IN ({placeholders})"
                    ),
                    reg_params,
                )
            ).all()
            for row in user_rows:
                rip = str(row._mapping.get("registerIp") or "")
                if not rip:
                    continue
                uid = str(row._mapping.get("cid"))
                bucket = register_map.setdefault(rip, [])
                if uid not in bucket:
                    bucket.append(uid)

    for item in formatted:
        merged = list(dict.fromkeys(login_map.get(item["ip"], []) + register_map.get(item["ip"], [])))
        item["cid"] = ", ".join(merged)
    return _ok({"items": formatted, "total": int(total)})


# ==================== 职员 ====================
@router.get("/staff")
@handle()
async def list_staff(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `Staff` ORDER BY `cid` ASC"))).all()
    return _ok(_rows(rows, ("active", "online")))


@router.post("/staff")
@handle()
async def create_staff(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    name = body.get("name")
    department = body.get("department")
    position = body.get("position")
    if not name or not department or not position:
        return _fail(400, "missing fields")

    raw_cid = body.get("cid")
    new_cid = _maybe_int(raw_cid) if raw_cid else None
    if not new_cid:
        row = (
            await db.execute(text("SELECT `cid` FROM `Staff` ORDER BY `cid` DESC LIMIT 1"))
        ).first()
        base = _maybe_int(row._mapping["cid"]) if row is not None else None
        new_cid = (base or 3000) + 1
    else:
        existing = (
            await db.execute(text("SELECT `cid` FROM `Staff` WHERE `cid` = :cid"), {"cid": new_cid})
        ).first()
        if existing is not None:
            return _fail(409, f"CID {new_cid} exists")

    await db.execute(
        text(
            "INSERT INTO `Staff` (`cid`, `name`, `department`, `position`, `rating`, `active`) "
            "VALUES (:cid, :name, :department, :position, :rating, :active)"
        ),
        {
            "cid": new_cid,
            "name": name,
            "department": department,
            "position": position,
            "rating": body.get("rating") or "",
            "active": 0 if body.get("active") is False else 1,
        },
    )
    await db.commit()
    await _write_audit(
        db, "add_staff", f"Staff {name}({new_cid}) added", current.cid
    )
    row = (
        await db.execute(text("SELECT * FROM `Staff` WHERE `cid` = :cid"), {"cid": new_cid})
    ).first()
    return _ok(_row(row, ("active", "online")) if row is not None else None)


@router.put("/staff/{cid}")
@handle()
async def update_staff(
    cid: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    for field in ("name", "department", "position", "rating"):
        if field in body and body[field] is not None:
            updates[field] = body[field]
    if "active" in body and body["active"] is not None:
        updates["active"] = 1 if body["active"] else 0

    exists = (
        await db.execute(text("SELECT `cid` FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["cid"] = cid
        await db.execute(text(f"UPDATE `Staff` SET {set_clause} WHERE `cid` = :cid"), params)
        await db.commit()
    await _write_audit(db, "edit_staff", f"Staff CID {cid} updated", current.cid)
    row = (
        await db.execute(text("SELECT * FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    return _ok(_row(row, ("active", "online")) if row is not None else None)


@router.delete("/staff/{cid}")
@handle()
async def delete_staff(
    cid: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    _rating: CurrentUser = Depends(require_rating(11)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `cid` FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    await db.commit()
    await _write_audit(db, "delete_staff", f"Staff CID {cid} deleted", current.cid)
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/logs/audit")
@handle("query failed")
async def logs_audit(
    page: str = "1",
    pageSize: str = "20",  # noqa: N803
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    rows = (
        await db.execute(
            text(f"SELECT * FROM `AuditLog` ORDER BY `createdAt` DESC LIMIT {take} OFFSET {skip}")
        )
    ).all()
    total = (await db.execute(text("SELECT COUNT(*) AS c FROM `AuditLog`"))).scalar_one()
    formatted = [
        {
            "id": item.get("id"),
            "action": item.get("action"),
            "operator": item.get("userId"),
            "detail": item.get("detail"),
            "time": _zh(item.get("createdAt")),
        }
        for item in _rows(rows)
    ]
    return _ok({"items": formatted, "total": int(total)})


# ==================== IP 封禁管理 ====================
@router.get("/ip-bans")
@handle()
async def list_ip_bans(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(text("SELECT * FROM `IpBan` ORDER BY `active` DESC, `id` DESC"))
    ).all()
    bans = _rows(rows, ("active",))
    now = _utcnow()

    cids = list(dict.fromkeys([str(item.get("bannedBy") or "") for item in bans if item.get("bannedBy")]))
    name_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        name_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}

    ip_to_cids: dict[str, list[str]] = {}
    register_rows = (
        await db.execute(
            text("SELECT `cid`, `registerIp` FROM `User` WHERE `registerIp` <> ''")
        )
    ).all()
    for row in register_rows:
        ip = str(row._mapping.get("registerIp") or "")
        if not ip:
            continue
        bucket = ip_to_cids.setdefault(ip, [])
        cid_value = str(row._mapping.get("cid"))
        if cid_value not in bucket:
            bucket.append(cid_value)

    formatted = []
    for item in bans:
        expires = item.get("expiresAt")
        formatted.append(
            {
                "id": item.get("id"),
                "ip": item.get("ip"),
                "reason": item.get("reason"),
                "bannedBy": item.get("bannedBy"),
                "bannedName": name_map.get(str(item.get("bannedBy") or ""), ""),
                "bannedUser": item.get("bannedUser") or "",
                "bannedUserCids": ip_to_cids.get(str(item.get("ip") or ""), []),
                "active": bool(item.get("active")) and (not expires or expires > now),
                "expired": bool(expires) and expires < now,
                "expiresAt": expires,
                "createdAt": _zh(item.get("createdAt")),
            }
        )
    return _ok(formatted)


@router.post("/ip-bans")
@handle()
async def create_ip_ban(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    normalized = normalize_ip(body.get("ip"))
    if not normalized:
        return _fail(400, "无效的 IP 地址")
    hours = _maybe_int(body.get("hours")) or 0
    expires_at = (
        _utcnow() + dt.timedelta(hours=hours) if body.get("hours") and hours > 0 else None
    )
    operator = current.cid or "system"
    existing = (
        await db.execute(text("SELECT * FROM `IpBan` WHERE `ip` = :ip"), {"ip": normalized})
    ).first()
    if existing is not None:
        record_id = existing._mapping["id"]
        await db.execute(
            text(
                "UPDATE `IpBan` SET `active` = 1, `reason` = :reason, `bannedBy` = :by, "
                "`bannedUser` = :banned_user, `expiresAt` = :expires WHERE `id` = :id"
            ),
            {
                "reason": body.get("reason") or existing._mapping.get("reason"),
                "by": operator,
                "banned_user": body.get("bannedUser") or existing._mapping.get("bannedUser"),
                "expires": expires_at,
                "id": record_id,
            },
        )
    else:
        result = await db.execute(
            text(
                "INSERT INTO `IpBan` (`ip`, `reason`, `bannedBy`, `bannedUser`, `active`, "
                "`expiresAt`, `createdAt`) VALUES (:ip, :reason, :by, :banned_user, 1, :expires, :created_at)"
            ),
            {
                "ip": normalized,
                "reason": body.get("reason") or "",
                "by": operator,
                "banned_user": body.get("bannedUser") or "",
                "expires": expires_at,
                "created_at": _utcnow(),
            },
        )
        record_id = result.lastrowid
    await db.commit()

    reason_text = body.get("reason") or ""
    await _write_audit(
        db,
        "ban_ip",
        "IP "
        + normalized
        + " 被封禁"
        + (f"（{reason_text}）" if reason_text else "")
        + (f"，至 {_zh(expires_at)}" if expires_at else "（永久）"),
        current.cid,
    )
    await refresh_bans()
    row = (
        await db.execute(text("SELECT * FROM `IpBan` WHERE `id` = :id"), {"id": record_id})
    ).first()
    return _ok(_row(row, ("active",)) if row is not None else None)


@router.put("/ip-bans/{ban_id}")
@handle()
async def update_ip_ban(
    ban_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    raw_ip = body.get("ip")
    if raw_ip is not None and str(raw_ip).strip() != "":
        normalized = normalize_ip(str(raw_ip).strip())
        if not normalized:
            return _fail(400, "无效的 IP 地址")
        dup = (
            await db.execute(
                text("SELECT `id` FROM `IpBan` WHERE `ip` = :ip AND `id` <> :id"),
                {"ip": normalized, "id": ban_id},
            )
        ).first()
        if dup is not None:
            return _fail(409, "该 IP 已在封禁列表中")
        updates["ip"] = normalized
    if "reason" in body and body["reason"] is not None:
        updates["reason"] = body["reason"]
    if "bannedUser" in body and body["bannedUser"] is not None:
        updates["bannedUser"] = str(body["bannedUser"] or "")
    active_given = "active" in body and body["active"] is not None
    if active_given:
        updates["active"] = 1 if body["active"] else 0
    hours = _maybe_int(body.get("hours")) or 0
    if "hours" in body and hours > 0:
        updates["expiresAt"] = _utcnow() + dt.timedelta(hours=hours)

    exists = (
        await db.execute(text("SELECT `id` FROM `IpBan` WHERE `id` = :id"), {"id": ban_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = ban_id
        await db.execute(text(f"UPDATE `IpBan` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `IpBan` WHERE `id` = :id"), {"id": ban_id})
    ).first()
    record = _row(row, ("active",)) if row is not None else {}

    if active_given:
        if record.get("active"):
            await _write_audit(db, "unban_ip", "IP " + str(record.get("ip")) + " 已解封", current.cid)
        else:
            await _write_audit(db, "ban_ip", "IP " + str(record.get("ip")) + " 已封禁", current.cid)
    else:
        reason_note = f"，原因={body.get('reason')}" if "reason" in body else ""
        await _write_audit(
            db, "edit_ban", "IP 封禁已编辑: " + str(record.get("ip")) + reason_note, current.cid
        )
    await refresh_bans()
    return _ok(record)


@router.delete("/ip-bans/{ban_id}")
@handle()
async def delete_ip_ban(
    ban_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    row = (
        await db.execute(text("SELECT * FROM `IpBan` WHERE `id` = :id"), {"id": ban_id})
    ).first()
    if row is None:
        return _fail(404, "not found")
    record = _row(row)
    await db.execute(text("DELETE FROM `IpBan` WHERE `id` = :id"), {"id": ban_id})
    await db.commit()
    await _write_audit(
        db, "unban_ip", "IP " + str(record.get("ip") or f"#{ban_id}") + " 已从封禁列表删除", current.cid
    )
    await refresh_bans()
    return JSJSONResponse({"success": True, "message": "deleted"})


# ==================== 网络管理（IP 白/黑名单） ====================
@router.get("/ip-list")
@handle()
async def list_ip_list(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `IpList` ORDER BY `id` DESC"))).all()
    items = _rows(rows, ("active",))
    cids = list(dict.fromkeys([str(item.get("addedBy") or "") for item in items if item.get("addedBy")]))
    name_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        name_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}
    formatted = [
        {
            "id": item.get("id"),
            "ip": item.get("ip"),
            "type": item.get("type"),
            "reason": item.get("reason") or "",
            "addedBy": item.get("addedBy") or "",
            "addedName": name_map.get(str(item.get("addedBy") or ""), ""),
            "active": item.get("active"),
            "createdAt": _zh(item.get("createdAt")),
        }
        for item in items
    ]
    return _ok(formatted)


@router.post("/ip-list")
@handle()
async def create_ip_list_entry(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    normalized = normalize_ip(body.get("ip"))
    if not normalized:
        return _fail(400, "无效的 IP 地址")
    kind = "white" if body.get("type") == "white" else "black"
    operator = current.cid or "system"
    existing = (
        await db.execute(text("SELECT * FROM `IpList` WHERE `ip` = :ip"), {"ip": normalized})
    ).first()
    if existing is not None:
        record_id = existing._mapping["id"]
        await db.execute(
            text(
                "UPDATE `IpList` SET `type` = :type, `reason` = :reason, `addedBy` = :by, "
                "`active` = 1 WHERE `id` = :id"
            ),
            {
                "type": kind,
                "reason": body.get("reason") or existing._mapping.get("reason"),
                "by": operator,
                "id": record_id,
            },
        )
    else:
        result = await db.execute(
            text(
                "INSERT INTO `IpList` (`ip`, `type`, `reason`, `addedBy`, `active`, `createdAt`) "
                "VALUES (:ip, :type, :reason, :by, 1, :created_at)"
            ),
            {
                "ip": normalized,
                "type": kind,
                "reason": body.get("reason") or "",
                "by": operator,
                "created_at": _utcnow(),
            },
        )
        record_id = result.lastrowid
    await db.commit()
    reason_text = body.get("reason") or ""
    await _write_audit(
        db,
        "add_ip_list",
        "IP " + normalized + " 加入" + ("白名单" if kind == "white" else "黑名单")
        + (f"（{reason_text}）" if reason_text else ""),
        current.cid,
    )
    await refresh_ip_list()
    row = (
        await db.execute(text("SELECT * FROM `IpList` WHERE `id` = :id"), {"id": record_id})
    ).first()
    return _ok(_row(row, ("active",)) if row is not None else None)


@router.put("/ip-list/{item_id}")
@handle()
async def update_ip_list_entry(
    item_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    raw_ip = body.get("ip")
    if raw_ip is not None and str(raw_ip).strip() != "":
        normalized = normalize_ip(str(raw_ip).strip())
        if not normalized:
            return _fail(400, "无效的 IP 地址")
        dup = (
            await db.execute(
                text("SELECT `id` FROM `IpList` WHERE `ip` = :ip AND `id` <> :id"),
                {"ip": normalized, "id": item_id},
            )
        ).first()
        if dup is not None:
            return _fail(409, "该 IP 已在名单中")
        updates["ip"] = normalized
    if "type" in body and body["type"] is not None:
        updates["type"] = "white" if body["type"] == "white" else "black"
    if "reason" in body and body["reason"] is not None:
        updates["reason"] = body["reason"]
    if "active" in body and body["active"] is not None:
        updates["active"] = 1 if body["active"] else 0

    exists = (
        await db.execute(text("SELECT `id` FROM `IpList` WHERE `id` = :id"), {"id": item_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = item_id
        await db.execute(text(f"UPDATE `IpList` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `IpList` WHERE `id` = :id"), {"id": item_id})
    ).first()
    record = _row(row, ("active",)) if row is not None else {}
    await _write_audit(
        db, "edit_ip_list", "IP " + str(record.get("ip")) + " 名单信息已更新", current.cid
    )
    await refresh_ip_list()
    return _ok(record)


@router.delete("/ip-list/{item_id}")
@handle()
async def delete_ip_list_entry(
    item_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    row = (
        await db.execute(text("SELECT * FROM `IpList` WHERE `id` = :id"), {"id": item_id})
    ).first()
    if row is None:
        return _fail(404, "not found")
    record = _row(row)
    await db.execute(text("DELETE FROM `IpList` WHERE `id` = :id"), {"id": item_id})
    await db.commit()
    await _write_audit(
        db, "delete_ip_list", "IP " + str(record.get("ip") or f"#{item_id}") + " 已从名单删除", current.cid
    )
    await refresh_ip_list()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.post("/ip-list/import")
@handle()
async def import_ip_list(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    ips = body.get("ips")
    if not isinstance(ips, list) or len(ips) == 0:
        return _fail(400, "未提供有效 IP 列表")
    if len(ips) > 5000:
        return _fail(400, "单次最多导入 5000 条")
    kind = "white" if body.get("type") == "white" else "black"
    default_reason = str(body.get("reason") or "").strip()
    operator = current.cid or "system"
    added = 0
    skipped = 0
    for item in ips:
        if isinstance(item, str):
            raw = item
            item_reason = ""
        elif isinstance(item, dict):
            raw = item.get("ip") or ""
            item_reason = str(item.get("reason") or "")
        else:
            raw = ""
            item_reason = ""
        item_reason = item_reason.strip()
        normalized = normalize_ip(str(raw or "").strip())
        if not normalized:
            skipped += 1
            continue
        final_reason = item_reason or default_reason or "批量导入"
        existing = (
            await db.execute(text("SELECT * FROM `IpList` WHERE `ip` = :ip"), {"ip": normalized})
        ).first()
        if existing is not None:
            if final_reason:
                await db.execute(
                    text(
                        "UPDATE `IpList` SET `type` = :type, `active` = 1, `addedBy` = :by, "
                        "`reason` = :reason WHERE `id` = :id"
                    ),
                    {"type": kind, "by": operator, "reason": final_reason, "id": existing._mapping["id"]},
                )
            else:
                await db.execute(
                    text(
                        "UPDATE `IpList` SET `type` = :type, `active` = 1, `addedBy` = :by "
                        "WHERE `id` = :id"
                    ),
                    {"type": kind, "by": operator, "id": existing._mapping["id"]},
                )
        else:
            await db.execute(
                text(
                    "INSERT INTO `IpList` (`ip`, `type`, `reason`, `addedBy`, `active`, `createdAt`) "
                    "VALUES (:ip, :type, :reason, :by, 1, :created_at)"
                ),
                {
                    "ip": normalized,
                    "type": kind,
                    "reason": final_reason,
                    "by": operator,
                    "created_at": _utcnow(),
                },
            )
        added += 1
    await db.commit()
    await _write_audit(
        db,
        "import_ip_list",
        "批量导入" + ("白名单" if kind == "white" else "黑名单") + f" {added} 条，跳过 {skipped} 条",
        current.cid,
    )
    await refresh_ip_list()
    return _ok({"added": added, "skipped": skipped})


# ==================== 网络管理（IP 集合） ====================
@router.get("/ip-groups")
@handle()
async def list_ip_groups(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `IpGroup` ORDER BY `id` DESC"))).all()
    groups = _rows(rows, ("active",))
    members: dict[int, list[dict[str, Any]]] = {}
    if groups:
        id_list = [int(item["id"]) for item in groups]
        placeholders = ", ".join(f":g{index}" for index in range(len(id_list)))
        params = {f"g{index}": value for index, value in enumerate(id_list)}
        member_rows = (
            await db.execute(
                text(
                    "SELECT `id`, `groupId`, `ip`, `createdAt` FROM `IpGroupMember` "
                    f"WHERE `groupId` IN ({placeholders}) ORDER BY `id`"
                ),
                params,
            )
        ).all()
        for row in member_rows:
            mapping = row._mapping
            members.setdefault(int(mapping["groupId"]), []).append(
                {"id": mapping["id"], "ip": mapping["ip"]}
            )

    cids = list(dict.fromkeys([str(item.get("addedBy") or "") for item in groups if item.get("addedBy")]))
    name_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        name_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}

    formatted = [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "type": item.get("type"),
            "reason": item.get("reason") or "",
            "addedBy": item.get("addedBy") or "",
            "addedName": name_map.get(str(item.get("addedBy") or ""), ""),
            "active": item.get("active"),
            "createdAt": _zh(item.get("createdAt")),
            "members": members.get(int(item["id"]), []),
        }
        for item in groups
    ]
    return _ok(formatted)


# 集合概览（不含成员明细，仅带成员计数）
@router.get("/ip-groups/summary")
@handle()
async def summary_ip_groups(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `IpGroup` ORDER BY `id` DESC"))).all()
    groups = _rows(rows, ("active",))
    counts: dict[int, int] = {}
    count_rows = (
        await db.execute(
            text("SELECT `groupId`, COUNT(*) AS c FROM `IpGroupMember` GROUP BY `groupId`")
        )
    ).all()
    for row in count_rows:
        counts[int(row._mapping["groupId"])] = int(row._mapping["c"])

    cids = list(dict.fromkeys([str(item.get("addedBy") or "") for item in groups if item.get("addedBy")]))
    name_map: dict[str, str] = {}
    if cids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(cids)))
        params = {f"cid{index}": value for index, value in enumerate(cids)}
        user_rows = (
            await db.execute(
                text(f"SELECT `cid`, `username` FROM `User` WHERE `cid` IN ({placeholders})"),
                params,
            )
        ).all()
        name_map = {str(row._mapping["cid"]): row._mapping["username"] for row in user_rows}

    formatted = [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "type": item.get("type"),
            "active": item.get("active"),
            "addedBy": item.get("addedBy") or "",
            "addedName": name_map.get(str(item.get("addedBy") or ""), ""),
            "memberCount": counts.get(int(item["id"]), 0),
            "createdAt": _zh(item.get("createdAt")),
        }
        for item in groups
    ]
    return _ok(formatted)


@router.post("/ip-groups")
@handle()
async def create_ip_group(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    kind = "white" if body.get("type") == "white" else "black"
    name = str(body.get("name") or "").strip()[:100] or ("白名单集合" if kind == "white" else "黑名单集合")
    result = await db.execute(
        text(
            "INSERT INTO `IpGroup` (`name`, `type`, `reason`, `addedBy`, `active`, `createdAt`) "
            "VALUES (:name, :type, :reason, :by, 1, :created_at)"
        ),
        {
            "name": name,
            "type": kind,
            "reason": body.get("reason") or "",
            "by": current.cid or "system",
            "created_at": _utcnow(),
        },
    )
    await db.commit()
    await _write_audit(
        db,
        "add_ip_group",
        "创建" + ("白名单" if kind == "white" else "黑名单") + "集合 " + name,
        current.cid,
    )
    await refresh_ip_list()
    row = (
        await db.execute(
            text("SELECT * FROM `IpGroup` WHERE `id` = :id"), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row, ("active",)) if row is not None else None)


@router.put("/ip-groups/{group_id}")
@handle()
async def update_ip_group(
    group_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    if "name" in body and body["name"] is not None:
        updates["name"] = str(body["name"] or "").strip()[:100]
    if "type" in body and body["type"] is not None:
        updates["type"] = "white" if body["type"] == "white" else "black"
    if "reason" in body and body["reason"] is not None:
        updates["reason"] = body["reason"]
    if "active" in body and body["active"] is not None:
        updates["active"] = 1 if body["active"] else 0

    exists = (
        await db.execute(text("SELECT `id` FROM `IpGroup` WHERE `id` = :id"), {"id": group_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = group_id
        await db.execute(text(f"UPDATE `IpGroup` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `IpGroup` WHERE `id` = :id"), {"id": group_id})
    ).first()
    record = _row(row, ("active",)) if row is not None else {}
    await _write_audit(db, "edit_ip_group", "IP 集合 " + str(record.get("name")) + " 已更新", current.cid)
    await refresh_ip_list()
    return _ok(record)


@router.delete("/ip-groups/{group_id}")
@handle()
async def delete_ip_group(
    group_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    row = (
        await db.execute(text("SELECT * FROM `IpGroup` WHERE `id` = :id"), {"id": group_id})
    ).first()
    if row is None:
        return _fail(404, "not found")
    record = _row(row)
    await db.execute(text("DELETE FROM `IpGroupMember` WHERE `groupId` = :id"), {"id": group_id})
    await db.execute(text("DELETE FROM `IpGroup` WHERE `id` = :id"), {"id": group_id})
    await db.commit()
    await _write_audit(
        db,
        "delete_ip_group",
        "IP 集合 " + str(record.get("name") or f"#{group_id}") + " 已删除（含其 IP）",
        current.cid,
    )
    await refresh_ip_list()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.post("/ip-groups/{group_id}/members")
@handle()
async def add_ip_group_member(
    group_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    normalized = normalize_ip(body.get("ip"))
    if not normalized:
        return _fail(400, "无效的 IP 地址")
    group = (
        await db.execute(text("SELECT * FROM `IpGroup` WHERE `id` = :id"), {"id": group_id})
    ).first()
    if group is None:
        return _fail(404, "集合不存在")
    result = await db.execute(
        text(
            "INSERT INTO `IpGroupMember` (`groupId`, `ip`, `createdAt`) "
            "VALUES (:group_id, :ip, :created_at)"
        ),
        {"group_id": group_id, "ip": normalized, "created_at": _utcnow()},
    )
    await db.commit()
    await _write_audit(
        db,
        "add_ip_group_member",
        "IP " + normalized + " 加入集合 " + str(group._mapping.get("name")),
        current.cid,
    )
    await refresh_ip_list()
    row = (
        await db.execute(
            text("SELECT * FROM `IpGroupMember` WHERE `id` = :id"), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row) if row is not None else None)


@router.delete("/ip-groups/{group_id}/members/{member_id}")
@handle()
async def delete_ip_group_member(
    group_id: int,
    member_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    row = (
        await db.execute(text("SELECT * FROM `IpGroupMember` WHERE `id` = :id"), {"id": member_id})
    ).first()
    if row is None:
        return _fail(404, "not found")
    record = _row(row)
    await db.execute(text("DELETE FROM `IpGroupMember` WHERE `id` = :id"), {"id": member_id})
    await db.commit()
    await _write_audit(
        db,
        "delete_ip_group_member",
        "IP " + str(record.get("ip") or f"#{member_id}") + " 已从集合移除",
        current.cid,
    )
    await refresh_ip_list()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.post("/ip-groups/import")
@handle()
async def import_ip_group(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    group_id = body.get("groupId")
    if not group_id:
        return _fail(400, "请选择目标集合")
    ips = body.get("ips")
    if not isinstance(ips, list) or len(ips) == 0:
        return _fail(400, "未提供有效 IP 列表")
    if len(ips) > 5000:
        return _fail(400, "单次最多导入 5000 条")
    gid = _as_int(group_id)
    group = (
        await db.execute(text("SELECT * FROM `IpGroup` WHERE `id` = :id"), {"id": gid})
    ).first()
    if group is None:
        return _fail(404, "集合不存在")

    existing_rows = (
        await db.execute(
            text("SELECT `ip` FROM `IpGroupMember` WHERE `groupId` = :id"), {"id": gid}
        )
    ).all()
    exist = {str(row._mapping["ip"]) for row in existing_rows}
    seen: set[str] = set()
    to_create: list[dict[str, Any]] = []
    now = _utcnow()
    for item in ips:
        raw = item if isinstance(item, str) else (item.get("ip") or "" if isinstance(item, dict) else "")
        normalized = normalize_ip(str(raw or "").strip())
        if not normalized:
            continue
        if normalized in exist or normalized in seen:
            continue
        seen.add(normalized)
        to_create.append({"group_id": gid, "ip": normalized, "created_at": now})
    if to_create:
        await db.execute(
            text(
                "INSERT INTO `IpGroupMember` (`groupId`, `ip`, `createdAt`) "
                "VALUES (:group_id, :ip, :created_at)"
            ),
            to_create,
        )
        await db.commit()
    skipped = len(ips) - len(to_create)
    await _write_audit(
        db,
        "import_ip_group",
        "向集合 " + str(group._mapping.get("name")) + f" 导入 {len(to_create)} 条，跳过 {skipped} 条",
        current.cid,
    )
    await refresh_ip_list()
    return _ok({"added": len(to_create), "skipped": skipped})


# ==================== 活动管理 ====================
def _parse_event_time(event: dict[str, Any]) -> float:
    """对齐 Node `parseEventTime`：返回本地时间戳（ms），无日期返回 inf。"""
    raw_date = str(event.get("date") or "").strip()
    raw_time = str(event.get("time") or "").strip()
    if not raw_date:
        return float("inf")
    date_text = raw_date
    if re.fullmatch(r"\d{1,2}[/-]\d{1,2}", raw_date):
        parts = re.split(r"[/-]", raw_date)
        date_text = f"{dt.datetime.now().year}-{parts[0]}-{parts[1]}"
    stamp = f"{date_text}T{raw_time}" if raw_time else f"{date_text}T00:00"
    try:
        parsed = dt.datetime.fromisoformat(stamp)
    except ValueError:
        return float("inf")
    return parsed.timestamp() * 1000


def _apply_dynamic_status(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """对齐 Node `applyDynamicStatus`（含 `_start` 字段与倒序排列）。"""
    now_ms = _now_ms()
    decorated: list[dict[str, Any]] = []
    for item in events:
        start = _parse_event_time(item)
        entry = dict(item)
        entry["_start"] = None if start == float("inf") else int(start)
        entry["__start_raw"] = start
        decorated.append(entry)
    future = [item for item in decorated if item["__start_raw"] != float("inf") and item["__start_raw"] > now_ms]
    future.sort(key=lambda item: item["__start_raw"])
    past = [item for item in decorated if item["__start_raw"] != float("inf") and item["__start_raw"] <= now_ms]
    for index, item in enumerate(future):
        item["status"] = "报名中" if index == 0 else "筹备中"
    for item in past:
        item["status"] = "已结束"

    def sort_key(item: dict[str, Any]) -> float:
        start = item["__start_raw"]
        return float("-inf") if start == float("inf") else -start

    decorated.sort(key=sort_key)
    for item in decorated:
        item.pop("__start_raw", None)
    return decorated


@router.get("/events")
@handle()
async def list_events(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `Event` ORDER BY `id` DESC"))).all()
    return _ok(_apply_dynamic_status(_rows(rows)))


@router.post("/events")
@handle()
async def create_event(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    title = body.get("title")
    date = body.get("date")
    if not title or not date:
        return _fail(400, "missing fields")
    result = await db.execute(
        text(
            "INSERT INTO `Event` (`title`, `date`, `time`, `dep`, `arr`, `route`, `publisher`, "
            "`distance`, `notams`, `atcPositions`, `desc`, `poster`, `status`) VALUES "
            "(:title, :date, :time, :dep, :arr, :route, :publisher, :distance, :notams, "
            ":atc_positions, :desc, :poster, :status)"
        ),
        {
            "title": title,
            "date": date,
            "time": body.get("time") or "",
            "dep": body.get("dep") or "",
            "arr": body.get("arr") or "",
            "route": body.get("route") or "",
            "publisher": current.cid,
            "distance": body.get("distance") or "",
            "notams": body.get("notams") or "",
            "atc_positions": body.get("atcPositions") or "",
            "desc": body.get("desc") or "",
            "poster": body.get("poster") or "",
            "status": body.get("status") or "筹备中",
        },
    )
    await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `Event` WHERE `id` = :id"), {"id": result.lastrowid})
    ).first()
    return _ok(_row(row) if row is not None else None)


@router.put("/events/{event_id}")
@handle()
async def update_event(
    event_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    fields = (
        "title",
        "date",
        "time",
        "dep",
        "arr",
        "route",
        "distance",
        "notams",
        "atcPositions",
        "desc",
        "poster",
        "status",
    )
    updates = {field: body[field] for field in fields if field in body and body[field] is not None}
    exists = (
        await db.execute(text("SELECT `id` FROM `Event` WHERE `id` = :id"), {"id": event_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = event_id
        await db.execute(text(f"UPDATE `Event` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `Event` WHERE `id` = :id"), {"id": event_id})
    ).first()
    return _ok(_row(row) if row is not None else None)


def _is_image_buffer(head: bytes) -> bool:
    """对齐 Node `isImageBuffer`（前 16 字节魔数）。"""
    if not head or len(head) < 3:
        return False
    if len(head) >= 3 and head[0] == 0xFF and head[1] == 0xD8 and head[2] == 0xFF:
        return True
    if len(head) >= 4 and head[0] == 0x89 and head[1] == 0x50 and head[2] == 0x4E and head[3] == 0x47:
        return True
    if head[:3] == b"GIF":
        return True
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return True
    return False


# 活动海报上传（Node 该处理器没有 try/catch → 未捕获异常走全局 500「服务器内部错误」）
@router.post("/events/{event_id}/poster")
async def upload_event_poster(
    event_id: int,
    poster: Optional[UploadFile] = File(None),
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    if poster is None or not poster.filename:
        return _fail(400, "请选择图片")
    original = str(poster.filename)
    ext = Path(original).suffix.lower()
    # multer fileFilter / fileSize 抛错 → 全局错误处理 → 500「服务器内部错误」
    if ext not in POSTER_ALLOWED_EXT:
        return _fail(500, "服务器内部错误")
    content = await poster.read()
    if len(content) > POSTER_MAX_BYTES:
        return _fail(500, "服务器内部错误")

    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"event_{_now_ms()}{ext}"
    target = POSTER_DIR / filename
    target.write_bytes(content)

    if not _is_image_buffer(content[:16]):
        try:
            target.unlink()
        except OSError:
            pass
        return _fail(400, "文件内容不是有效图片")

    poster_path = "/uploads/posters/" + filename
    updated = await db.execute(
        text("UPDATE `Event` SET `poster` = :poster WHERE `id` = :id"),
        {"poster": poster_path, "id": event_id},
    )
    await db.commit()
    if updated.rowcount == 0:
        # 对齐 Prisma P2025 → 全局错误处理器 500「服务器内部错误」
        raise RuntimeError(f"Event {event_id} not found")
    return _ok({"poster": poster_path})


# 活动报名列表（必须在 DELETE /events/:id 之前定义）
@router.get("/events/{event_id}/registrations")
@handle()
async def list_event_registrations(
    event_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    base_sql = (
        "SELECT * FROM `EventRegistration` WHERE `eventId` = :event_id AND `type` = :type "
        "AND `status` <> 'cancelled' ORDER BY `createdAt` ASC"
    )
    pilots = _rows((await db.execute(text(base_sql), {"event_id": event_id, "type": "pilot"})).all())
    controllers = _rows(
        (await db.execute(text(base_sql), {"event_id": event_id, "type": "controller"})).all()
    )
    all_ids = list(
        dict.fromkeys([str(item.get("userId") or "") for item in pilots + controllers if item.get("userId")])
    )
    user_map: dict[str, dict[str, Any]] = {}
    if all_ids:
        placeholders = ", ".join(f":cid{index}" for index in range(len(all_ids)))
        params = {f"cid{index}": value for index, value in enumerate(all_ids)}
        user_rows = (
            await db.execute(
                text(
                    "SELECT `cid`, `username`, `rating`, `fsdLevel` FROM `User` "
                    f"WHERE `cid` IN ({placeholders})"
                ),
                params,
            )
        ).all()
        for row in user_rows:
            mapping = row._mapping
            user_map[str(mapping["cid"])] = {
                "cid": mapping["cid"],
                "username": mapping["username"],
                "rating": mapping["rating"],
                "fsdLevel": mapping["fsdLevel"],
            }
    event_row = (
        await db.execute(text("SELECT * FROM `Event` WHERE `id` = :id"), {"id": event_id})
    ).first()
    data: dict[str, Any] = _row(event_row) if event_row is not None else {}
    data["pilots"] = [{**item, "user": user_map.get(str(item.get("userId") or ""))} for item in pilots]
    data["controllers"] = [
        {**item, "user": user_map.get(str(item.get("userId") or ""))} for item in controllers
    ]
    data["pilotCount"] = len(pilots)
    data["controllerCount"] = len(controllers)
    return _ok(data)


# 管理员取消任意报名（必须在 DELETE /events/:id 之前定义）
@router.delete("/events/registrations/{reg_id}")
@handle()
async def cancel_event_registration(
    reg_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(
            text("SELECT `id` FROM `EventRegistration` WHERE `id` = :id"), {"id": reg_id}
        )
    ).first()
    if exists is None:
        return _fail(404, "报名记录不存在")
    await db.execute(
        text("UPDATE `EventRegistration` SET `status` = 'cancelled' WHERE `id` = :id"),
        {"id": reg_id},
    )
    await db.commit()
    return JSJSONResponse({"success": True, "message": "已取消报名"})


@router.delete("/events/{event_id}")
@handle()
async def delete_event(
    event_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_EVENT)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Event` WHERE `id` = :id"), {"id": event_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Event` WHERE `id` = :id"), {"id": event_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


# ==================== 机场地面数据提交（超管 + WEB_SECRET 双校验） ====================
@router.post("/airports/{icao}")
@handle()
async def submit_airport_data(
    icao: str,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    code = re.sub(r"[^A-Z0-9]", "", str(icao or "").upper())
    if not code:
        return _fail(400, "无效 ICAO")
    if (current.rating or 0) != 12:
        return _fail(403, "仅超级管理员可提交机场数据")
    body = await _body(request)
    secret = body.get("secret")
    geojson = body.get("geojson")
    expected = os.environ.get("WEB_SECRET") or ""
    if (
        not expected
        or not isinstance(secret, str)
        or not hmac.compare_digest(
            hashlib.sha256(secret.encode("utf-8")).digest(),
            hashlib.sha256(expected.encode("utf-8")).digest(),
        )
    ):
        return _fail(403, "提交密码不正确")
    if (
        not isinstance(geojson, dict)
        or geojson.get("type") != "FeatureCollection"
        or not isinstance(geojson.get("features"), list)
    ):
        return _fail(400, "数据格式不正确")
    AIRPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (AIRPORT_DATA_DIR / f"{code}.json").write_text(
        json.dumps(geojson, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    await _write_audit(
        db, "edit_map", f"User {current.cid or 'unknown'} update MAP-{code}", current.cid
    )
    return JSJSONResponse(
        {"success": True, "message": f"{code} 机场地面数据已提交，所有用户已生效"}
    )


# ==================== 申请管理 ====================
@router.get("/applications/role")
@handle()
async def list_role_applications(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
) -> JSJSONResponse:
    return _ok([])


@router.get("/applications/staff")
@handle()
async def list_staff_applications(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(
            text("SELECT * FROM `Application` WHERE `type` = 'staff' ORDER BY `id` DESC")
        )
    ).all()
    return _ok(_rows(rows))


async def _review_application(
    db: AsyncSession,
    app_id: int,
    body: dict[str, Any],
    current: CurrentUser,
    *,
    controller: bool,
) -> JSJSONResponse:
    """职员/管制申请审批公共逻辑（对齐 Node PUT /applications/{staff,controller}/:id）。"""
    status = body.get("status")
    review_comment = body.get("reviewComment")
    interview1 = body.get("interviewTime1")
    interview2 = body.get("interviewTime2")

    current_row = (
        await db.execute(text("SELECT * FROM `Application` WHERE `id` = :id"), {"id": app_id})
    ).first()
    if current_row is None:
        return _fail(404, "申请不存在")
    existing = _row(current_row)

    is_interview_invite = status == "待面试"
    is_approved = status in ("已通过", "Approved")
    is_rejected = status in ("已拒绝", "Rejected")

    if is_approved and existing.get("status") != "待面试":
        return _fail(400, "该申请尚未面试，请先邀请面试，面试通过后才能通过申请")

    updates: dict[str, Any] = {}
    if status is not None:
        updates["status"] = status
    if review_comment is not None:
        updates["reviewComment"] = review_comment
    if interview1 is not None:
        updates["interviewTime1"] = interview1
    if interview2 is not None:
        updates["interviewTime2"] = interview2
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = app_id
        await db.execute(text(f"UPDATE `Application` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    app_row = (
        await db.execute(text("SELECT * FROM `Application` WHERE `id` = :id"), {"id": app_id})
    ).first()
    app = _row(app_row) if app_row is not None else dict(existing)

    if is_approved:
        cid = _maybe_int(app.get("userId"))
        if cid is not None:
            staff_row = (
                await db.execute(text("SELECT * FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
            ).first()
            if staff_row is None:
                department = "Control" if controller else (app.get("department") or "General")
                position = "Controller" if controller else "Staff"
                await db.execute(
                    text(
                        "INSERT INTO `Staff` (`cid`, `name`, `department`, `position`, `rating`, `active`) "
                        "VALUES (:cid, :name, :department, :position, '', 1)"
                    ),
                    {
                        "cid": cid,
                        "name": app.get("name"),
                        "department": department,
                        "position": position,
                    },
                )
                await db.commit()
            elif controller:
                department = str(staff_row._mapping.get("department") or "")
                if "Control" not in department:
                    await db.execute(
                        text(
                            "UPDATE `Staff` SET `department` = 'Control', `position` = :position "
                            "WHERE `cid` = :cid"
                        ),
                        {
                            "position": staff_row._mapping.get("position") or "Controller",
                            "cid": cid,
                        },
                    )
                    await db.commit()

    if is_interview_invite or is_approved or is_rejected:
        try:
            user_row = (
                await db.execute(
                    text(sel("User", "WHERE `cid` = :cid")), {"cid": app.get("userId")}
                )
            ).first()
            email = (user_row._mapping.get("email") if user_row is not None else "") or ""
            if email:
                application_type = "管制员申请" if controller else "职员申请"
                target_name = escape_html_admin(app.get("name") or app.get("userId") or "")
                if is_interview_invite:
                    times = [item for item in (interview1, interview2) if item]
                    time_html = ""
                    if times:
                        time_html = "<br><br><strong>面试时间：</strong><br>" + "<br>".join(
                            f"{index + 1}. {escape_html_admin(value)}"
                            for index, value in enumerate(times)
                        )
                    await send_interview_invite(
                        email,
                        {
                            "applicationType": application_type,
                            "reason": escape_html_admin(review_comment or ""),
                            "detail": "申请对象：" + target_name + time_html,
                        },
                    )
                else:
                    await send_review_result(
                        email,
                        {
                            "applicationType": application_type,
                            "result": "已通过" if is_approved else "已拒绝",
                            "reason": escape_html_admin(review_comment or ""),
                            "detail": "申请对象：" + target_name,
                        },
                    )
        except Exception as mail_err:  # noqa: BLE001
            log.error("[Email] Application review send failed: %s", mail_err)
    return _ok(app)


@router.put("/applications/staff/{app_id}")
@handle()
async def review_staff_application(
    app_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    return await _review_application(db, app_id, body, current, controller=False)


@router.get("/applications/controller")
@handle()
async def list_controller_applications(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(
            text("SELECT * FROM `Application` WHERE `type` = 'controller' ORDER BY `id` DESC")
        )
    ).all()
    return _ok(_rows(rows))


@router.put("/applications/controller/{app_id}")
@handle()
async def review_controller_application(
    app_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    return await _review_application(db, app_id, body, current, controller=True)


@router.delete("/applications/controller/{app_id}")
@handle()
async def delete_controller_application(
    app_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Application` WHERE `id` = :id"), {"id": app_id})
    ).first()
    if exists is None:
        return _fail(404, "申请不存在")
    await db.execute(text("DELETE FROM `Application` WHERE `id` = :id"), {"id": app_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "已删除"})


# ==================== 其他列表类接口 ====================
@router.get("/forum")
@handle()
async def admin_forum(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_STAFF)),
) -> JSJSONResponse:
    return _ok([])


@router.get("/va")
@handle()
async def admin_va(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
) -> JSJSONResponse:
    return _ok({})


@router.get("/flightplans")
@handle()
async def admin_flightplans(
    page: str = "1",
    pageSize: str = "20",  # noqa: N803
    userId: Optional[str] = None,  # noqa: N803
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_FLIGHTPLAN)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    where = ""
    params: dict[str, Any] = {}
    if userId:
        where = " WHERE `userId` = :uid"
        params["uid"] = userId
    total = (
        await db.execute(text(f"SELECT COUNT(*) AS c FROM `FlightPlan`{where}"), params)
    ).scalar_one()
    rows = (
        await db.execute(
            text(
                f"SELECT * FROM `FlightPlan`{where} ORDER BY `id` DESC LIMIT {take} OFFSET {skip}"
            ),
            params,
        )
    ).all()
    return _ok({"items": _rows(rows, ("syncFsd", "locked")), "total": int(total)})


@router.delete("/flightplans/{plan_id}")
@handle()
async def admin_delete_flightplan(
    plan_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_FLIGHTPLAN)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `FlightPlan` WHERE `id` = :id"), {"id": plan_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `FlightPlan` WHERE `id` = :id"), {"id": plan_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/tickets")
@handle()
async def admin_tickets(
    page: str = "1",
    pageSize: str = "20",  # noqa: N803
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_TICKET)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    skip, take = _paging(page, pageSize)
    total = (await db.execute(text("SELECT COUNT(*) AS c FROM `Ticket`"))).scalar_one()
    rows = (
        await db.execute(
            text(f"SELECT * FROM `Ticket` ORDER BY `id` DESC LIMIT {take} OFFSET {skip}")
        )
    ).all()
    return _ok({"items": _rows(rows), "total": int(total)})


@router.put("/tickets/{ticket_id}")
@handle()
async def admin_update_ticket(
    ticket_id: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_TICKET)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    status = body.get("status")
    reply = body.get("reply")

    existing_row = (
        await db.execute(text("SELECT * FROM `Ticket` WHERE `id` = :id"), {"id": ticket_id})
    ).first()
    if existing_row is None:
        return _fail(404, "工单不存在")
    existing = _row(existing_row)
    if str(existing.get("userId") or "") == str(current.cid or ""):
        return _fail(403, "不能处理自己的工单")

    updates: dict[str, Any] = {}
    if status is not None:
        updates["status"] = status
    if reply is not None:
        updates["reply"] = reply
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["id"] = ticket_id
        await db.execute(text(f"UPDATE `Ticket` SET {set_clause} WHERE `id` = :id"), params)
        await db.commit()
    ticket_row = (
        await db.execute(text("SELECT * FROM `Ticket` WHERE `id` = :id"), {"id": ticket_id})
    ).first()
    ticket = _row(ticket_row) if ticket_row is not None else dict(existing)

    if reply is not None and ticket.get("userId"):
        try:
            user_row = (
                await db.execute(
                    text(sel("User", "WHERE `cid` = :cid")), {"cid": ticket.get("userId")}
                )
            ).first()
            email = (user_row._mapping.get("email") if user_row is not None else "") or ""
            if email:
                mailer.fire_and_forget(
                    send_notification_ex(
                        email,
                        {
                            "subject": "工单 #" + str(ticket.get("id")) + " 已回复",
                            "intro": "您的工单收到了一条新的回复。",
                            "body": "工单标题："
                            + str(ticket.get("title") or "")
                            + "<br>回复内容："
                            + str(reply)[:500],
                            "action": "查看工单",
                            "actionUrl": (os.environ.get("FRONTEND_URL") or "http://localhost:5173")
                            + "/tickets",
                        },
                    )
                )
        except Exception as mail_err:  # noqa: BLE001
            log.error("[Email] Ticket reply send failed: %s", mail_err)
    return _ok(ticket)


@router.delete("/tickets/{ticket_id}")
@handle()
async def admin_delete_ticket(
    ticket_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_TICKET)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Ticket` WHERE `id` = :id"), {"id": ticket_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Ticket` WHERE `id` = :id"), {"id": ticket_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/controllers")
@handle()
async def admin_controllers(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(
            text("SELECT * FROM `Staff` WHERE `department` LIKE '%Control%' ORDER BY `cid` ASC")
        )
    ).all()
    return _ok(_rows(rows, ("active", "online")))


@router.put("/controllers/{cid}")
@handle()
async def admin_update_controller(
    cid: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_CONTROLLER)),
    _rating: CurrentUser = Depends(require_rating(11)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    updates: dict[str, Any] = {}
    for field in ("name", "position", "rating"):
        if field in body and body[field] is not None:
            updates[field] = body[field]
    exists = (
        await db.execute(text("SELECT `cid` FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    if updates:
        set_clause = ", ".join(f"`{column}` = :{column}" for column in updates)
        params = dict(updates)
        params["cid"] = cid
        await db.execute(text(f"UPDATE `Staff` SET {set_clause} WHERE `cid` = :cid"), params)
        await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    return _ok(_row(row, ("active", "online")) if row is not None else None)


@router.get("/online")
@handle()
async def admin_online(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_ONLINE)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """在线状态。

    Node 端 `prisma.whazzupData` 在 schema.prisma 中并不存在（无 WhazzupData model），
    因此 `findFirst` 必然抛错，整段被 `catch` 吞掉，实际返回恒为空：
    `{"success":true,"data":{"clients":[],"servers":[],"staff":[]}}`。
    这里保留同样的可观测行为：快照表不存在（或解析失败）时返回空结构。
    """
    try:
        row = (
            await db.execute(
                text("SELECT `data` FROM `WhazzupData` ORDER BY `id` DESC LIMIT 1")
            )
        ).first()
        parsed = json.loads(row._mapping["data"]) if row is not None else {}
        staff_rows = (await db.execute(text("SELECT * FROM `Staff` ORDER BY `cid` ASC"))).all()
        return _ok(
            {
                "clients": parsed.get("clients") or [],
                "servers": parsed.get("servers") or [],
                "staff": _rows(staff_rows, ("active", "online")),
            }
        )
    except Exception:  # noqa: BLE001 - 与 Node 的空 catch 一致
        return _ok({"clients": [], "servers": [], "staff": []})


@router.put("/online/staff/{cid}")
@handle()
async def admin_update_online_staff(
    cid: int,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_ONLINE)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    active = 0 if body.get("active") is False else 1
    exists = (
        await db.execute(text("SELECT `cid` FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("UPDATE `Staff` SET `active` = :active WHERE `cid` = :cid"), {"active": active, "cid": cid})
    await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `Staff` WHERE `cid` = :cid"), {"cid": cid})
    ).first()
    return _ok(_row(row, ("active", "online")) if row is not None else None)


@router.get("/notifications")
@handle()
async def admin_notifications(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `Notification` ORDER BY `id` DESC"))).all()
    return _ok(_rows(rows, ("read",)))


@router.post("/notifications")
@handle()
async def admin_create_notification(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """注意：Node 写入的 `publisher` / `targetUsers` 并不是 `Notification` 表的列。

    Prisma 会因未知字段抛校验错误 → `catch` → 500 `{"success":false,"message":"操作失败"}`，
    即该接口在 Node 侧恒为 500。这里按同样的列名写库（表无该列时数据库报错），
    保持与 Node 一致的响应；若未来补列，则按 Node 的意图落库。
    """
    body = await _body(request)
    title = body.get("title")
    content = body.get("content")
    if not title or not content:
        return _fail(400, "missing fields")
    result = await db.execute(
        text(
            "INSERT INTO `Notification` (`title`, `content`, `publisher`, `targetUsers`) "
            "VALUES (:title, :content, :publisher, :target_users)"
        ),
        {
            "title": title,
            "content": content,
            "publisher": current.username or "",
            "target_users": body.get("targetUsers") or "",
        },
    )
    await db.commit()
    row = (
        await db.execute(
            text("SELECT * FROM `Notification` WHERE `id` = :id"), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row, ("read",)) if row is not None else None, message="sent")


@router.delete("/notifications/{notif_id}")
@handle()
async def admin_delete_notification(
    notif_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Notification` WHERE `id` = :id"), {"id": notif_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Notification` WHERE `id` = :id"), {"id": notif_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/training/courses")
@handle()
async def admin_training_courses(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(text("SELECT * FROM `TrainingCourse` ORDER BY `id` DESC"))
    ).all()
    return _ok(_rows(rows))


@router.post("/training/courses")
@handle()
async def admin_create_training_course(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    """Node 写入的 `type` / `publisher` 不是 `TrainingCourse` 的列 → Prisma 抛错 → 500 操作失败。

    按同样的列名写库以保持响应一致（表无该列 → 数据库报错）。
    """
    body = await _body(request)
    title = body.get("title")
    content = body.get("content")
    if not title or not content:
        return _fail(400, "missing fields")
    result = await db.execute(
        text(
            "INSERT INTO `TrainingCourse` (`title`, `content`, `type`, `publisher`) "
            "VALUES (:title, :content, :type, :publisher)"
        ),
        {
            "title": title,
            "content": content,
            "type": body.get("type") or "article",
            "publisher": current.username or "",
        },
    )
    await db.commit()
    row = (
        await db.execute(
            text("SELECT * FROM `TrainingCourse` WHERE `id` = :id"), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row) if row is not None else None)


@router.delete("/training/courses/{course_id}")
@handle()
async def admin_delete_training_course(
    course_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(
            text("SELECT `id` FROM `TrainingCourse` WHERE `id` = :id"), {"id": course_id}
        )
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `TrainingCourse` WHERE `id` = :id"), {"id": course_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/training/records")
@handle()
async def admin_training_records(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (
        await db.execute(text("SELECT * FROM `TrainingRecord` ORDER BY `id` DESC"))
    ).all()
    return _ok(_rows(rows, ("passed", "completed")))


@router.get("/achievements")
@handle()
async def admin_achievements(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `Achievement` ORDER BY `id` DESC"))).all()
    return _ok(_rows(rows))


@router.post("/achievements")
@handle()
async def admin_create_achievement(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    name = body.get("name")
    if not name:
        return _fail(400, "missing fields")
    result = await db.execute(
        text(
            "INSERT INTO `Achievement` (`name`, `description`, `icon`) "
            "VALUES (:name, :description, :icon)"
        ),
        {
            "name": name,
            "description": body.get("description") or "",
            "icon": body.get("icon") or "",
        },
    )
    await db.commit()
    row = (
        await db.execute(
            text("SELECT * FROM `Achievement` WHERE `id` = :id"), {"id": result.lastrowid}
        )
    ).first()
    return _ok(_row(row) if row is not None else None)


@router.delete("/achievements/{ach_id}")
@handle()
async def admin_delete_achievement(
    ach_id: int,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    exists = (
        await db.execute(text("SELECT `id` FROM `Achievement` WHERE `id` = :id"), {"id": ach_id})
    ).first()
    if exists is None:
        return _fail(404, "not found")
    await db.execute(text("DELETE FROM `Achievement` WHERE `id` = :id"), {"id": ach_id})
    await db.commit()
    return JSJSONResponse({"success": True, "message": "deleted"})


@router.get("/config")
@handle()
async def admin_config(
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    rows = (await db.execute(text("SELECT * FROM `SystemConfig`"))).all()
    return _ok(_rows(rows))


@router.put("/config/{key}")
@handle()
async def admin_update_config(
    key: str,
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_USER)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    value = body.get("value")
    await db.execute(
        text(
            "INSERT INTO `SystemConfig` (`key`, `value`) VALUES (:key, :value) "
            "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)"
        ),
        {"key": key, "value": value},
    )
    await db.commit()
    row = (
        await db.execute(text("SELECT * FROM `SystemConfig` WHERE `key` = :key"), {"key": key})
    ).first()
    return _ok(_row(row) if row is not None else None)


@router.post("/kick-fsd")
@handle()
async def admin_kick_fsd(
    request: Request,
    current: CurrentUser = Depends(admin_guard),
    _perm: CurrentUser = Depends(require_permission(PERM_ONLINE)),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    body = await _body(request)
    cid = body.get("cid")
    if not cid:
        return _fail(400, "missing cid")
    reason = body.get("reason")
    user_row = (
        await db.execute(text(sel("User", "WHERE `cid` = :cid")), {"cid": cid})
    ).first()
    email = (user_row._mapping.get("email") if user_row is not None else "") or ""
    if email:
        try:
            await send_notification_ex(
                email,
                {
                    "subject": "您已被移出 FSD 服务器",
                    "intro": "您已从 FSD 服务器断开连接。",
                    "body": "CID："
                    + str(cid)
                    + "<br>原因："
                    + str(reason or "未提供原因。")
                    + "<br>如果您认为这是误操作，请联系管理员。",
                },
            )
        except Exception as exc:  # noqa: BLE001 - 邮件失败不阻塞（Node send() 不抛错）
            log.error("[Email] kick-fsd send failed: %s", exc)
    await _write_audit(
        db, "kick_fsd", "User " + str(cid) + " kicked from FSD: " + str(reason or ""), current.cid
    )
    return JSJSONResponse({"success": True, "message": "kick notification sent"})


__all__ = ["router", "generate_random_password", "admin_guard"]
