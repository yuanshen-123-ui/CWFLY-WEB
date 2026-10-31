"""后台定时任务（逐条对齐 Node `server.js` 的 setInterval/启动钩子）。

对照表（Node 位置 → 本模块）：

| Node server.js                | 周期        | 本模块任务                         |
|-------------------------------|-------------|------------------------------------|
| OnlineUser 僵尸清理 + 广播     | 60s         | `_online_cleanup_loop`             |
| SecurityEvent 清理             | 1h（先跑一次）| `_security_cleanup_loop`         |
| LoginAttempt 清理（24h 保留）  | 1h（先跑一次）| `_login_attempt_cleanup_loop`    |
| mysqldump 备份 + 旧备份清理    | 6h（60s 后首跑）| `_backup_loop`                 |
| 设备指纹证据备份（TSV+SHA256） | 6h          | `_backup_loop`（同一循环内）       |
| whazzup 生成（30s）            | 30s（先跑一次）| `_whazzup_loop`                 |
| FSD 在线轮询（15s）            | 15s（先跑一次）| `_fsd_poll_loop`                |
| IpBan/IpList 兜底刷新          | 60s         | `_ip_ban_refresh_loop`             |
| DeviceBan 兜底刷新             | 60s         | `_device_ban_refresh_loop`         |
| 启动预热 ensureBansLoaded 等   | 启动        | `warmup()` / `_preheat_loop`        |

Node 的 `src/middleware/ipTracker.js` 每 60s 把内存聚合落库 IpVisit —— 记录侧是 Express
中间件（属他人文件），这里不重复实现；另外提供**可选**的 IpVisit 保留期清理
（`IP_VISIT_RETENTION_DAYS`，默认 0=关闭；Node 无此任务，仅用于控制表体积）。

启动方式：`app/main.py` 的 lifespan 里 `start_jobs()`（同步创建任务），退出时 `await stop_jobs()`；
如需阻塞式预热，可 `await warmup()`。
"""
from __future__ import annotations

import asyncio
import datetime as dt
import hashlib
import logging
import os
import re
import shutil
import time
import zlib
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services import device_fp as device_ban_store
from app.services import fsd_tracker, ip_ban_store, whazzup
from app.services.env_compat import PROJECT_ROOT, env_int
from app.utils.json_compat import js_iso

log = logging.getLogger("cwfly.jobs")

# ---- 周期（秒）与保留期（与 Node 常量逐一对齐）
ONLINE_CLEANUP_INTERVAL = 60.0
SECURITY_CLEANUP_INTERVAL = 60 * 60.0
SECURITY_RETENTION_HOURS = env_int("SECURITY_RETENTION_HOURS", 720)  # 默认 30 天
LOGIN_ATTEMPT_RETENTION_HOURS = 24
BACKUP_INTERVAL = 6 * 60 * 60.0
BACKUP_FIRST_DELAY = 60.0
BACKUP_RETENTION_DAYS = 30
FINGERPRINT_BACKUP_RETENTION_DAYS = 30
IP_BAN_REFRESH_INTERVAL = 60.0
DEVICE_BAN_REFRESH_INTERVAL = 60.0
IP_VISIT_RETENTION_DAYS = env_int("IP_VISIT_RETENTION_DAYS", 0)  # 0 = 不清理（Node 无此任务）

BACKUP_DIR = Path(os.environ.get("BACKUP_DIR") or (PROJECT_ROOT / "backups"))
FP_BACKUP_DIR = BACKUP_DIR / "fingerprints"

_tasks: List["asyncio.Task[None]"] = []
_started = False


# =====================================================================
# 1. 在线用户僵尸清理（server.js:75-80）
# =====================================================================
async def _online_cleanup_loop() -> None:
    from app.sockets.server import cleanup_online_users

    while True:
        await asyncio.sleep(ONLINE_CLEANUP_INTERVAL)
        try:
            await cleanup_online_users()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("[OnlineUser 清理失败] %s", exc)


# =====================================================================
# 2. 安全事件清理（server.js:354-370）
# =====================================================================
async def cleanup_security_events(retention_hours: Optional[int] = None) -> int:
    """删除超过保留期（默认 720h）的 SecurityEvent，返回删除行数。"""
    hours = SECURITY_RETENTION_HOURS if retention_hours is None else retention_hours
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(hours=hours)
    try:
        async with SessionLocal() as db:
            result = await db.execute(
                text("DELETE FROM `SecurityEvent` WHERE `createdAt` < :cutoff"), {"cutoff": cutoff}
            )
            await db.commit()
            count = int(result.rowcount or 0)
        if count > 0:
            log.info("[Security] 已清理 %s 条过期安全事件记录", count)
        return count
    except Exception as exc:
        log.error("[Security] 清理失败: %s", exc)
        return 0


async def _security_cleanup_loop() -> None:
    # Node：启动即跑一次，然后每小时
    await cleanup_security_events()
    while True:
        await asyncio.sleep(SECURITY_CLEANUP_INTERVAL)
        await cleanup_security_events()


# =====================================================================
# 3. 登录失败记录清理（server.js:373-389）
# =====================================================================
async def cleanup_login_attempts() -> int:
    """删除超过 24h 的 LoginAttempt，返回删除行数。"""
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(
        hours=LOGIN_ATTEMPT_RETENTION_HOURS
    )
    try:
        async with SessionLocal() as db:
            result = await db.execute(
                text("DELETE FROM `LoginAttempt` WHERE `createdAt` < :cutoff"), {"cutoff": cutoff}
            )
            await db.commit()
            count = int(result.rowcount or 0)
        if count > 0:
            log.info("[LoginLock] 已清理 %s 条过期登录失败记录", count)
        return count
    except Exception as exc:
        log.error("[LoginLock] 清理失败: %s", exc)
        return 0


async def _login_attempt_cleanup_loop() -> None:
    await cleanup_login_attempts()
    while True:
        await asyncio.sleep(SECURITY_CLEANUP_INTERVAL)
        await cleanup_login_attempts()


# =====================================================================
# 4. 数据库备份 / 旧备份清理（server.js:391-401 + keyRotation.js）
# =====================================================================
_DB_URL_RE = re.compile(r"mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)")


def _parse_database_url() -> Optional[Dict[str, str]]:
    from app.config import settings

    match = _DB_URL_RE.match(settings.DATABASE_URL or "")
    if not match:
        return None
    user, password, host, port, db = match.groups()
    return {"user": user, "password": password, "host": host, "port": port, "db": db}


async def backup_database() -> bool:
    """mysqldump | gzip 流式备份到 `backups/cwfly-<UTC时间>.sql.gz`（不阻塞事件循环）。"""
    info = _parse_database_url()
    if not info:
        log.error("[Backup] 无法解析 DATABASE_URL")
        return False

    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    filepath = BACKUP_DIR / f"cwfly-{timestamp}.sql.gz"

    env = dict(os.environ)
    env["MYSQL_PWD"] = info["password"]  # 不把密码放命令行（对齐 Node 安全修复）
    args = [
        "mysqldump",
        "--single-transaction",
        "--quick",
        "-h",
        info["host"],
        "-P",
        info["port"],
        "-u",
        info["user"],
        info["db"],
    ]
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,  # 警告不视为失败（与 Node 一致）
            env=env,
        )
    except FileNotFoundError:
        log.error("[Backup] 未找到 mysqldump，可执行文件不可用")
        return False
    except Exception as exc:
        log.error("[Backup] 备份启动失败: %s", exc)
        return False

    compressor = zlib.compressobj(9, zlib.DEFLATED, 16 + zlib.MAX_WBITS)  # gzip 容器
    written = 0
    try:
        with open(filepath, "wb") as fh:
            while True:
                chunk = await process.stdout.read(65536) if process.stdout else b""
                if not chunk:
                    break
                fh.write(compressor.compress(chunk))
                written += len(chunk)
            fh.write(compressor.flush())
        await process.wait()
    except Exception as exc:
        log.error("[Backup] 备份写入失败: %s", exc)
        try:
            filepath.unlink(missing_ok=True)
        except Exception:
            pass
        return False

    if process.returncode not in (0, None):
        log.error("[Backup] mysqldump 退出码 %s", process.returncode)
        try:
            filepath.unlink(missing_ok=True)
        except Exception:
            pass
        return False
    if written == 0:
        log.error("[Backup] 备份内容为空，已丢弃 %s", filepath.name)
        try:
            filepath.unlink(missing_ok=True)
        except Exception:
            pass
        return False

    size_mb = filepath.stat().st_size / 1024 / 1024
    log.info("[Backup] 数据库已备份: %s (%.1f MB)", filepath.name, size_mb)
    return True


def _clean_old_backups_sync() -> int:
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        cutoff = time.time() - BACKUP_RETENTION_DAYS * 86400
        deleted = 0
        for path in BACKUP_DIR.glob("cwfly-*.sql.gz"):
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
                    deleted += 1
            except OSError:
                continue
        return deleted
    except Exception as exc:
        log.error("[Backup] 清理失败: %s", exc)
        return 0


async def clean_old_backups() -> int:
    """删除超过 30 天的 `cwfly-*.sql.gz`（Node `cleanOldBackups`）。"""
    deleted = await asyncio.to_thread(_clean_old_backups_sync)
    if deleted > 0:
        log.info("[Backup] 已清理 %s 个过期备份", deleted)
    return deleted


# =====================================================================
# 5. 设备指纹证据备份（deviceFpBackup.js）
# =====================================================================
def _tsv_safe(value: Any) -> str:
    """字段内换行/制表符转空格，保持 TSV 列结构。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, dt.datetime):
        return js_iso(value)
    return re.sub(r"[\t\r\n]+", " ", str(value))


def _to_tsv(columns: List[str], rows: List[Dict[str, Any]]) -> str:
    header = "\t".join(columns)
    body = ["\t".join(_tsv_safe(row.get(col)) for col in columns) for row in rows]
    return "\n".join([header, *body]) + "\n"


async def _fetch_fingerprint_rows() -> Dict[str, List[Dict[str, Any]]]:
    async with SessionLocal() as db:
        login_logs = (
            await db.execute(
                text(
                    "SELECT `id`, `userId`, `ip`, `deviceFp`, `userAgent`, `type`, `success`, `createdAt` "
                    "FROM `LoginLog` ORDER BY `id` DESC LIMIT 5000"
                )
            )
        ).all()
        events = (
            await db.execute(
                text(
                    "SELECT `id`, `ip`, `userId`, `deviceFp`, `network`, `path`, `referrer`, `userAgent`, `createdAt` "
                    "FROM `SecurityEvent` ORDER BY `id` DESC LIMIT 10000"
                )
            )
        ).all()
        users = (
            await db.execute(
                text(
                    "SELECT `cid`, `username`, `registerIp`, `registerFp`, `registerUserAgent`, `createdAt` "
                    "FROM `User` LIMIT 5000"
                )
            )
        ).all()
    return {
        "loginlog": [dict(row._mapping) for row in login_logs],
        "security": [dict(row._mapping) for row in events],
        "users": [dict(row._mapping) for row in users],
    }


def _clean_old_fingerprint_backups_sync() -> int:
    try:
        if not FP_BACKUP_DIR.exists():
            return 0
        cutoff = time.time() - FINGERPRINT_BACKUP_RETENTION_DAYS * 86400
        removed = 0
        for path in FP_BACKUP_DIR.glob("fp-*"):
            try:
                if path.is_dir() and path.stat().st_mtime < cutoff:
                    shutil.rmtree(path, ignore_errors=True)
                    removed += 1
            except OSError:
                continue
        return removed
    except Exception as exc:
        log.error("[deviceFpBackup] 清理旧备份失败: %s", exc)
        return 0


def _write_fingerprint_backup_sync(rows: Dict[str, List[Dict[str, Any]]]) -> str:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%f")
    target = FP_BACKUP_DIR / f"fp-{timestamp}"
    target.mkdir(parents=True, exist_ok=True)

    files = {
        "loginlog.tsv": _to_tsv(
            ["id", "userId", "ip", "deviceFp", "userAgent", "type", "success", "createdAt"],
            rows["loginlog"],
        ),
        "security_events.tsv": _to_tsv(
            ["id", "ip", "userId", "deviceFp", "network", "path", "referrer", "userAgent", "createdAt"],
            rows["security"],
        ),
        "users.tsv": _to_tsv(
            ["cid", "username", "registerIp", "registerFp", "registerUserAgent", "createdAt"],
            rows["users"],
        ),
    }

    sums: List[str] = []
    for name, content in files.items():
        path = target / name
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(content)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        sums.append(f"{digest}  {name}")

    summary = "\n".join(
        [
            "# CWFLY 设备指纹证据备份",
            f"# exported: {js_iso(dt.datetime.now(dt.timezone.utc))}",
            (
                "# rows: loginlog=%d security=%d users=%d"
                % (len(rows["loginlog"]), len(rows["security"]), len(rows["users"]))
            ),
            "",
            *sums,
            "",
        ]
    )
    with open(target / "SHA256SUMS", "w", encoding="utf-8", newline="") as fh:
        fh.write(summary)
    return str(target)


async def backup_device_fingerprints() -> bool:
    """LoginLog/SecurityEvent/User 指纹 → TSV + SHA256SUMS 固证（出错仅记日志）。"""
    try:
        rows = await _fetch_fingerprint_rows()
        target = await asyncio.to_thread(_write_fingerprint_backup_sync, rows)
        await asyncio.to_thread(_clean_old_fingerprint_backups_sync)
        log.info(
            "[deviceFpBackup] 备份完成: %s (loginlog=%d security=%d users=%d)",
            target,
            len(rows["loginlog"]),
            len(rows["security"]),
            len(rows["users"]),
        )
        return True
    except Exception as exc:
        log.error("[deviceFpBackup] 备份失败: %s", exc)
        return False


async def _backup_loop() -> None:
    # Node：启动时先 cleanOldBackups()，60s 后首次备份，之后每 6 小时
    await clean_old_backups()
    await asyncio.sleep(BACKUP_FIRST_DELAY)
    while True:
        try:
            await backup_database()
            await clean_old_backups()
            await backup_device_fingerprints()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error("[Backup] 周期任务失败: %s", exc)
        await asyncio.sleep(BACKUP_INTERVAL)


# =====================================================================
# 6. whazzup / FSD 轮询 / 名单刷新
# =====================================================================
async def _whazzup_loop() -> None:
    await whazzup.whazzup_loop()


async def _fsd_poll_loop() -> None:
    await fsd_tracker.fsd_poll_loop()


async def _ip_ban_refresh_loop() -> None:
    # 先跑一次（近似 Node 启动时 ensureBansLoaded），再每 60s 兜底
    try:
        await ip_ban_store.refresh_bans()
        await ip_ban_store.refresh_ip_list()
    except Exception as exc:
        log.warning("[IpBan] 启动预热失败: %s", exc)
    while True:
        await asyncio.sleep(IP_BAN_REFRESH_INTERVAL)
        try:
            await ip_ban_store.refresh_bans()
            await ip_ban_store.refresh_ip_list()
        except Exception as exc:
            log.warning("[IpBan] 定时刷新异常: %s", exc)


async def _device_ban_refresh_loop() -> None:
    try:
        await device_ban_store.refresh_device_bans()
    except Exception as exc:
        log.warning("[DeviceBan] 启动预热失败: %s", exc)
    while True:
        await asyncio.sleep(DEVICE_BAN_REFRESH_INTERVAL)
        try:
            await device_ban_store.refresh_device_bans()
        except Exception as exc:
            log.warning("[DeviceBan] 定时刷新异常: %s", exc)


# =====================================================================
# 7. IpVisit 保留期清理（可选，Node 无此任务）
# =====================================================================
async def prune_ip_visits(retention_days: Optional[int] = None) -> int:
    """删除超过保留期的 IpVisit（默认关闭；设 IP_VISIT_RETENTION_DAYS>0 生效）。"""
    days = IP_VISIT_RETENTION_DAYS if retention_days is None else retention_days
    if days <= 0:
        return 0
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(days=days)
    try:
        async with SessionLocal() as db:
            result = await db.execute(
                text("DELETE FROM `IpVisit` WHERE `lastSeen` < :cutoff"), {"cutoff": cutoff}
            )
            await db.commit()
            count = int(result.rowcount or 0)
        if count:
            log.info("[IpVisit] 已清理 %s 条超过 %s 天的访问记录", count, days)
        return count
    except Exception as exc:
        log.warning("[IpVisit] 清理失败: %s", exc)
        return 0


async def _ip_visit_prune_loop() -> None:
    while True:
        await asyncio.sleep(BACKUP_INTERVAL)
        await prune_ip_visits()


# =====================================================================
# 8. 启动/停止
# =====================================================================
async def warmup() -> None:
    """启动预热（等价 Node 启动阶段的 await ensureBansLoaded / await initPromise 之外的部分）。"""
    try:
        await ip_ban_store.refresh_bans()
        await ip_ban_store.refresh_ip_list()
    except Exception as exc:
        log.warning("[Jobs] IP 名单预热失败: %s", exc)
    try:
        await device_ban_store.ensure_device_bans_loaded()
    except Exception as exc:
        log.warning("[Jobs] 设备封禁预热失败: %s", exc)
    try:
        await whazzup.generate()
    except Exception as exc:
        log.warning("[Jobs] whazzup 首次生成失败: %s", exc)


async def _preheat_loop() -> None:
    await warmup()


def start_jobs() -> None:
    """创建全部后台任务（同步、幂等；lifespan 里直接调用）。"""
    global _started
    if _started:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        log.warning("[Jobs] 无运行中的事件循环，定时任务未启动")
        return

    _started = True
    plan = [
        ("cwfly.jobs.preheat", _preheat_loop()),
        ("cwfly.jobs.online_cleanup", _online_cleanup_loop()),
        ("cwfly.jobs.security_cleanup", _security_cleanup_loop()),
        ("cwfly.jobs.login_attempt_cleanup", _login_attempt_cleanup_loop()),
        ("cwfly.jobs.backup", _backup_loop()),
        ("cwfly.jobs.whazzup", _whazzup_loop()),
        ("cwfly.jobs.fsd_poll", _fsd_poll_loop()),
        ("cwfly.jobs.ip_ban_refresh", _ip_ban_refresh_loop()),
        ("cwfly.jobs.device_ban_refresh", _device_ban_refresh_loop()),
    ]
    if IP_VISIT_RETENTION_DAYS > 0:
        plan.append(("cwfly.jobs.ip_visit_prune", _ip_visit_prune_loop()))

    for name, coro in plan:
        task = loop.create_task(coro, name=name)
        _tasks.append(task)
    log.info("[Jobs] 已启动 %s 个后台任务", len(_tasks))


async def stop_jobs() -> None:
    """取消并等待全部后台任务退出（lifespan finally 调用）。"""
    global _started
    _started = False
    tasks = list(_tasks)
    _tasks.clear()
    for task in tasks:
        if not task.done():
            task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    log.info("[Jobs] 后台任务已全部停止（%s 个）", len(tasks))


def jobs_status() -> List[Dict[str, Any]]:
    """排障用：任务名 + 是否存活。"""
    return [
        {"name": task.get_name(), "done": task.done(), "cancelled": task.cancelled()}
        for task in _tasks
    ]


__all__ = [
    "SECURITY_RETENTION_HOURS",
    "BACKUP_DIR",
    "FP_BACKUP_DIR",
    "start_jobs",
    "stop_jobs",
    "warmup",
    "jobs_status",
    "cleanup_security_events",
    "cleanup_login_attempts",
    "backup_database",
    "clean_old_backups",
    "backup_device_fingerprints",
    "prune_ip_visits",
]
