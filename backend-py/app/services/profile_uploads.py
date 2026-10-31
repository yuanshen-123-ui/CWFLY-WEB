"""个人中心上传（头像 / 背景图）。

逐条对齐 Node：
- `src/utils/uploadSafety.js`       → ALLOWED_EXT / is_image_buffer（扩展名白名单 + 魔数）
- `src/routes/profile.js` multer    → 目录、文件名规则、大小上限

落盘目录（相对进程 cwd，与 app/main.py 的 StaticFiles 挂载一致）：
- `uploads/avatars`     头像，5MB
- `uploads/backgrounds` 背景图，10MB
文件名：
- 头像   `{cid}_{Date.now()}{ext}`
- 背景图 `bg_{cid}_{Date.now()}{ext}`

错误语义与 Node 完全一致：
- 扩展名不在白名单 / 超过大小上限 → multer 抛错 → Node 全局错误处理返回
  `500 {"success": false, "message": "服务器内部错误"}`（本模块抛 UploadRejected）；
- 魔数校验失败 → 路由内 400「文件内容不是有效图片」（本模块抛 NotAnImage）。
"""
from __future__ import annotations

import datetime as dt
import os
import re
import time
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

# 与 uploadSafety.js 完全一致
ALLOWED_EXT: frozenset[str] = frozenset({".png", ".jpg", ".jpeg", ".webp", ".gif"})

AVATAR_MAX_BYTES = 5 * 1024 * 1024
BG_MAX_BYTES = 10 * 1024 * 1024
BG_DAILY_LIMIT = 5

UPLOAD_ROOT = Path("uploads")
AVATAR_DIR = UPLOAD_ROOT / "avatars"
BG_DIR = UPLOAD_ROOT / "backgrounds"

_CHUNK = 64 * 1024


class UploadRejected(Exception):
    """等价 multer 的 fileFilter 拒绝 / LIMIT_FILE_SIZE 错误。"""


class NotAnImage(Exception):
    """落盘后魔数二次校验失败（Node: 400「文件内容不是有效图片」）。"""


def ext_of(original_name: str | None) -> str:
    """等价 `path.extname(name).toLowerCase()`。"""
    name = original_name or ""
    return os.path.splitext(name)[1].lower()


def is_image_buffer(head: bytes) -> bool:
    """复刻 uploadSafety.js 的 MAGIC 表判断（只看前 12 字节）。"""
    if not head or len(head) < 3:
        return False
    b = head
    if len(b) >= 3 and b[0] == 0xFF and b[1] == 0xD8 and b[2] == 0xFF:
        return True  # JPEG
    if len(b) >= 4 and b[0] == 0x89 and b[1] == 0x50 and b[2] == 0x4E and b[3] == 0x47:
        return True  # PNG
    if b[0:3] == b"GIF":
        return True  # GIF
    if len(b) >= 12 and b[0:4] == b"RIFF" and b[8:12] == b"WEBP":
        return True  # WEBP
    return False


def now_ms() -> int:
    """等价 `Date.now()`。"""
    return int(time.time() * 1000)


def _ensure_dir(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)


async def _stream_to_disk(file: UploadFile, dest: Path, limit: int) -> int:
    """分块落盘并强制大小上限（multer limits.fileSize 语义：一旦超限立即报错）。"""
    _ensure_dir(dest.parent)
    written = 0
    try:
        with dest.open("wb") as fh:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                written += len(chunk)
                if written > limit:
                    raise UploadRejected("LIMIT_FILE_SIZE")
                fh.write(chunk)
    except UploadRejected:
        remove_file(dest)
        raise
    except Exception:
        remove_file(dest)
        raise
    finally:
        try:
            await file.close()
        except Exception:
            pass
    return written


def _avatar_filename(cid: str, original_name: str | None) -> str:
    ext = ext_of(original_name)
    # Node: `${cid}_${Date.now()}${ext || '.jpg'}`
    return f"{cid}_{now_ms()}{ext or '.jpg'}"


def _bg_filename(cid: str, original_name: str | None) -> str:
    ext = ext_of(original_name)
    # Node: `bg_${cid}_${Date.now()}${ext || '.jpg'}`
    return f"bg_{cid}_{now_ms()}{ext or '.jpg'}"


def _assert_image_ext(original_name: str | None) -> None:
    if ext_of(original_name) not in ALLOWED_EXT:
        # multer fileFilter 抛出的普通 Error → Node 全局错误处理 500「服务器内部错误」
        raise UploadRejected("仅支持 png/jpg/jpeg/webp/gif 图片")


async def save_avatar(cid: str, file: UploadFile) -> str:
    """保存头像，返回文件名（路由据此拼 `/uploads/avatars/<name>`）。"""
    _assert_image_ext(file.filename)
    filename = _avatar_filename(cid, file.filename)
    dest = AVATAR_DIR / filename
    await _stream_to_disk(file, dest, AVATAR_MAX_BYTES)
    if not _head_is_image(dest):
        remove_file(dest)
        raise NotAnImage(filename)
    return filename


async def save_background(cid: str, file: UploadFile) -> str:
    """保存背景图，返回文件名（路由据此拼 `/uploads/backgrounds/<name>`）。"""
    _assert_image_ext(file.filename)
    filename = _bg_filename(cid, file.filename)
    dest = BG_DIR / filename
    await _stream_to_disk(file, dest, BG_MAX_BYTES)
    if not _head_is_image(dest):
        remove_file(dest)
        raise NotAnImage(filename)
    return filename


def _head_is_image(path: Path, size: int = 16) -> bool:
    """等价 `fs.readFileSync(path).subarray(0, 16)` + isImageBuffer。"""
    try:
        with path.open("rb") as fh:
            return is_image_buffer(fh.read(size))
    except OSError:
        return False


def bg_today_prefix(cid: str) -> str:
    """`bg_{cid}_{YYYYMMDD}`，日期取 UTC（`new Date().toISOString().slice(0,10)`）。"""
    date_str = dt.datetime.utcnow().strftime("%Y%m%d")
    return f"bg_{cid}_{date_str}"


def count_bg_today(cid: str) -> int:
    """统计当天已上传的背景图数量（等价 Node 读目录前缀匹配）。"""
    prefix = bg_today_prefix(cid)
    try:
        return sum(1 for name in os.listdir(BG_DIR) if name.startswith(prefix))
    except OSError:
        return 0


_URL_UPLOAD_RE = re.compile(r"^/uploads/(?P<rest>.+)$")


def uploads_path_for_url(url: str | None) -> Optional[Path]:
    """`/uploads/backgrounds/x.jpg` → `uploads/backgrounds/x.jpg`（限制在 uploads 根内）。"""
    if not url:
        return None
    m = _URL_UPLOAD_RE.match(str(url))
    if not m:
        return None
    candidate = (UPLOAD_ROOT / m.group("rest")).resolve()
    root = UPLOAD_ROOT.resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def remove_file(path: Path | None) -> None:
    """等价 `fs.unlinkSync`，失败静默（Node 外层有 try/catch）。"""
    if path is None:
        return
    try:
        if os.path.isfile(path):
            os.unlink(path)
    except OSError:
        pass


async def discard(file: UploadFile | None) -> None:
    if file is None:
        return
    try:
        await file.close()
    except Exception:
        pass


__all__ = [
    "ALLOWED_EXT",
    "AVATAR_MAX_BYTES",
    "BG_MAX_BYTES",
    "BG_DAILY_LIMIT",
    "AVATAR_DIR",
    "BG_DIR",
    "UploadRejected",
    "NotAnImage",
    "ext_of",
    "is_image_buffer",
    "now_ms",
    "save_avatar",
    "save_background",
    "bg_today_prefix",
    "count_bg_today",
    "uploads_path_for_url",
    "remove_file",
    "discard",
]
