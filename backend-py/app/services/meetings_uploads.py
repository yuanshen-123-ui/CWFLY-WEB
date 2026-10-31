"""会议资料上传 + 文档解析 + Meeting 表访问。

逐条对齐 Node `src/routes/meetings.js`：
- 落盘目录 `uploads/meetings`，上限 20MB（multer limits.fileSize）
- 文件名 `{Date.now()}-{safeName}`，`safeName = basename(name).replace(/[^a-zA-Z0-9._\\u4e00-\\u9fa5-]/g, '_')`
- 记录先以 `status='processing'` 落库并立即响应，解析完成后后台更新为 `ready` / `failed`
- 解析规则：`.docx` → HTML；`.pdf` → 文本包 `<p>`；其它 →「文件已上传。」

依赖说明（Node 用 mammoth / pdf-parse，Python 环境未安装同等库）：
- `.docx`：用标准库 zipfile + ElementTree 读 `word/document.xml`，逐段输出 `<p>`（不转换内嵌图片）；
- `.pdf`：用标准库 zlib 解压内容流并提取文本操作符，失败时与 Node 的 catch 分支同构。
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionLocal

log = logging.getLogger("cwfly.meetings")

UPLOAD_ROOT = Path("uploads")
MEETINGS_DIR = UPLOAD_ROOT / "meetings"
MAX_BYTES = 20 * 1024 * 1024
_CHUNK = 64 * 1024

MEETING_COLS = "id, title, date, size, content, status"

_SAFE_NAME_RE = re.compile(r"[^a-zA-Z0-9._\u4e00-\u9fa5-]")


class MeetingUploadRejected(Exception):
    """等价 multer 的 LIMIT_FILE_SIZE（Node 全局错误处理 → 500）。"""


# ==================== 文件名与落盘 ====================
def safe_filename(original_name: str | None) -> str:
    """`{Date.now()}-{sanitized basename}`（与 Node 完全一致）。"""
    raw = original_name or ""
    base = os.path.basename(raw.replace("\\", "/"))
    sanitized = _SAFE_NAME_RE.sub("_", base)
    return f"{int(time.time() * 1000)}-{sanitized}"


def display_title(original_name: str | None) -> str:
    """标题 = 原始文件名去扩展名（Node: path.basename(name, ext)）。"""
    raw = original_name or ""
    base = os.path.basename(raw.replace("\\", "/"))
    return os.path.splitext(base)[0]


async def save_upload(file: UploadFile) -> tuple[Path, int]:
    """落盘并返回 (路径, 字节数)；超过 20MB 抛 MeetingUploadRejected。"""
    MEETINGS_DIR.mkdir(parents=True, exist_ok=True)
    dest = MEETINGS_DIR / safe_filename(file.filename)
    written = 0
    try:
        with dest.open("wb") as fh:
            while True:
                chunk = await file.read(_CHUNK)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_BYTES:
                    raise MeetingUploadRejected("LIMIT_FILE_SIZE")
                fh.write(chunk)
    except MeetingUploadRejected:
        _unlink(dest)
        raise
    except Exception:
        _unlink(dest)
        raise
    finally:
        try:
            await file.close()
        except Exception:  # noqa: BLE001
            pass
    return dest, written


def _unlink(path: Path | None) -> None:
    if path is None:
        return
    try:
        if os.path.isfile(path):
            os.unlink(path)
    except OSError:
        pass


def size_label(size_bytes: int) -> str:
    """`${(size/1024).toFixed(1)} KB`。"""
    return f"{size_bytes / 1024:.1f} KB"


def utc_date_string() -> str:
    """`new Date().toISOString().slice(0, 10)`。"""
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


# ==================== HTML 转义 ====================
def escape_html(value: Any) -> str:
    """对齐 Node escapeHtml（`&` 先转义，避免二次转义）。"""
    if value is None or value == "":
        return ""
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#039;")
    )


# ==================== DOCX → HTML ====================
_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def docx_to_html(path: Path) -> str:
    """把 docx 正文段落转成 `<p>` 序列（等价 mammoth.convertToHtml 的最小实现）。"""
    with zipfile.ZipFile(path) as archive:
        try:
            xml_bytes = archive.read("word/document.xml")
        except KeyError as exc:
            raise ValueError("docx 缺少 word/document.xml") from exc
    root = ET.fromstring(xml_bytes)
    paragraphs: list[str] = []
    for paragraph in root.iter(f"{_W_NS}p"):
        pieces: list[str] = []
        for node in paragraph.iter():
            if node.tag == f"{_W_NS}t" and node.text:
                pieces.append(node.text)
            elif node.tag == f"{_W_NS}tab":
                pieces.append("\t")
            elif node.tag in (f"{_W_NS}br", f"{_W_NS}cr"):
                pieces.append("\n")
        text_value = "".join(pieces).strip()
        if text_value:
            paragraphs.append(f"<p>{escape_html(text_value)}</p>")
    return "".join(paragraphs)


# ==================== PDF → 文本 ====================
def _pdf_unescape(raw: bytes) -> str:
    out = bytearray()
    index = 0
    length = len(raw)
    while index < length:
        char = raw[index]
        if char == 0x5C and index + 1 < length:  # 反斜杠转义
            nxt = raw[index + 1]
            mapping = {0x6E: 0x0A, 0x72: 0x0D, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0C}
            if nxt in mapping:
                out.append(mapping[nxt])
                index += 2
                continue
            if 0x30 <= nxt <= 0x37:  # 八进制 \ddd
                digits = raw[index + 1 : index + 4]
                try:
                    out.append(int(digits, 8) & 0xFF)
                except ValueError:
                    pass
                index += 1 + len(digits)
                continue
            out.append(nxt)
            index += 2
            continue
        out.append(char)
        index += 1
    return out.decode("utf-8", "replace")


def _pdf_stream_text(stream: bytes) -> str:
    pieces: list[str] = []
    token_re = re.compile(
        rb"\[(?:[^\[\]\\]|\\.)*\]\s*TJ"
        rb"|\((?:[^()\\]|\\.)*\)\s*(?:Tj|'|\")"
        rb"|T\*"
        rb"|T[dD]",
        re.S,
    )
    for match in token_re.finditer(stream):
        token = match.group(0)
        if token in (b"T*", b"Td", b"TD"):
            pieces.append("\n")
            continue
        for literal in re.finditer(rb"\((?:[^()\\]|\\.)*\)", token, re.S):
            pieces.append(_pdf_unescape(literal.group(0)[1:-1]))
    return "".join(pieces)


def pdf_to_text(path: Path) -> str:
    """极简 PDF 文本提取（FlateDecode 内容流 + 文本操作符）。失败抛异常。"""
    data = path.read_bytes()
    if not data.startswith(b"%PDF"):
        raise ValueError("文件内容不是有效的 PDF")
    chunks: list[str] = []
    for match in re.finditer(rb"stream\r?\n", data):
        start = match.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        raw = data[start:end]
        try:
            raw = zlib.decompress(raw)
        except zlib.error:
            pass  # 未压缩流
        text_value = _pdf_stream_text(raw)
        if text_value.strip():
            chunks.append(text_value)
    return "\n".join(chunks)


# ==================== 解析总入口 ====================
async def parse_document(path: Path, original_name: str | None) -> str:
    """对齐 Node parseDocument：返回要落库的 HTML。"""
    ext = os.path.splitext(original_name or "")[1].lower()
    if ext == ".docx":
        value = docx_to_html(path)
        return value or "<p>文档内容为空</p>"
    if ext == ".pdf":
        try:
            raw_text = pdf_to_text(path)
            escaped = (
                raw_text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
                .replace("'", "&#039;")
            )
            body = "".join(
                f"<p>{line}</p>"
                for line in escaped.split("\n")
                if line.strip()
            )
            return body or "<p>PDF 文件内容为空</p>"
        except Exception as exc:  # noqa: BLE001
            return f"<p>PDF 文件已上传，但解析失败: {escape_html(str(exc))}</p>"
    return "<p>文件已上传。</p>"


# ==================== Meeting 表访问 ====================
def _row(row: Any) -> dict[str, Any]:
    return dict(row._mapping)


async def list_meetings(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(text(f"SELECT {MEETING_COLS} FROM `Meeting` ORDER BY id DESC"))
    ).all()
    return [_row(r) for r in rows]


async def get_meeting(db: AsyncSession, meeting_id: int) -> dict[str, Any] | None:
    row = (
        await db.execute(
            text(f"SELECT {MEETING_COLS} FROM `Meeting` WHERE id = :id LIMIT 1"),
            {"id": meeting_id},
        )
    ).first()
    return _row(row) if row else None


async def create_meeting(db: AsyncSession, data: dict[str, Any]) -> dict[str, Any]:
    result = await db.execute(
        text(
            "INSERT INTO `Meeting` (title, date, size, content, status) "
            "VALUES (:title, :date, :size, :content, :status)"
        ),
        {
            "title": data["title"],
            "date": data["date"],
            "size": data["size"],
            "content": data.get("content") or "",
            "status": data.get("status") or "ready",
        },
    )
    await db.commit()
    meeting_id = int(result.lastrowid)
    created = await get_meeting(db, meeting_id)
    return created or {"id": meeting_id, **data}


async def update_meeting_content(
    db: AsyncSession, meeting_id: int, content: str, status: str
) -> None:
    await db.execute(
        text("UPDATE `Meeting` SET content = :content, status = :status WHERE id = :id"),
        {"content": content, "status": status, "id": meeting_id},
    )
    await db.commit()


async def parse_in_background(meeting_id: int, path: Path, original_name: str | None) -> None:
    """等价 Node `setImmediate(async () => { ... })`：独立会话更新记录。"""
    try:
        async with SessionLocal() as db:
            content = await parse_document(path, original_name)
            await update_meeting_content(db, meeting_id, content, "ready")
    except Exception as exc:  # noqa: BLE001
        log.error("[Meeting] 解析失败 id=%s: %s", meeting_id, exc)
        try:
            async with SessionLocal() as db:
                await update_meeting_content(
                    db, meeting_id, f"<p>解析失败: {escape_html(str(exc))}</p>", "failed"
                )
        except Exception:  # noqa: BLE001
            pass


__all__ = [
    "MEETINGS_DIR",
    "MAX_BYTES",
    "MEETING_COLS",
    "MeetingUploadRejected",
    "safe_filename",
    "display_title",
    "save_upload",
    "size_label",
    "utc_date_string",
    "escape_html",
    "parse_document",
    "list_meetings",
    "get_meeting",
    "create_meeting",
    "update_meeting_content",
    "parse_in_background",
]
