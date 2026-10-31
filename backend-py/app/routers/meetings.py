"""/api/meetings 路由（逐接口对齐 Node src/routes/meetings.js）。

- GET  /        会议列表（公开，按 id 倒序）
- POST /upload  上传会议资料（需 rating >= 11；表单字段 `file`，20MB；先返回 processing，后台解析）

返回结构：`{ success: true, data: { ...meeting, fileUrl, status: 'processing' } }`
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.deps import CurrentUser, require_rating
from app.services import meetings_uploads as mu
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.meetings")
router = APIRouter(prefix="/meetings", tags=["meetings"])


def _ok(data: Any = None, message: str | None = None) -> JSJSONResponse:
    body: dict[str, Any] = {"success": True}
    if data is not None:
        body["data"] = data
    if message is not None:
        body["message"] = message
    return JSJSONResponse(body)


def _fail(status_code: int, message: str) -> JSJSONResponse:
    return JSJSONResponse({"success": False, "message": message}, status_code=status_code)


@router.get("")
async def list_meetings(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        return _ok(await mu.list_meetings(db))
    except Exception as exc:  # noqa: BLE001
        log.error("[meetings] 查询失败: %s", exc)
        return _fail(500, "查询失败")


@router.post("/upload")
async def upload_meeting(
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(require_rating(11)),
) -> JSJSONResponse:
    try:
        if file is None or not (file.filename or ""):
            return _fail(400, "请选择文件")

        # multer 抛错（超过 20MB）→ Node 全局错误处理 500「服务器内部错误」
        try:
            path, size_bytes = await mu.save_upload(file)
        except mu.MeetingUploadRejected:
            return _fail(500, "服务器内部错误")

        original_name = file.filename
        title = mu.display_title(original_name)

        # 先创建「处理中」记录并立即返回
        meeting = await mu.create_meeting(
            db,
            {
                "title": title,
                "date": mu.utc_date_string(),
                "size": mu.size_label(size_bytes),
                "content": "",
                "status": "processing",
            },
        )

        # 后台解析，完成后更新记录（不阻塞上传响应）
        asyncio.get_running_loop().create_task(
            mu.parse_in_background(int(meeting.get("id") or 0), path, original_name)
        )

        file_url = f"/uploads/meetings/{path.name}"
        return _ok({**meeting, "fileUrl": file_url, "status": "processing"})
    except Exception as exc:  # noqa: BLE001
        log.error("[meetings] 上传失败: %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
