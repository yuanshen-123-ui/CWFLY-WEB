"""/api/staff 路由（逐接口对齐 Node src/routes/staff.js）。

GET /api/staff?type=controller —— 职员公示（公开）
- type=controller 时只取 department 含 "Control"（与「管制员管理」同一数据源）
- 只返回公开字段；CID 掩码（保留首位 + **）
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.staff")
router = APIRouter(prefix="/staff", tags=["staff"])

_STAFF_COLS = "cid, name, department, position, rating, active, online"


def mask_cid(cid: object) -> str:
    """`String(cid).slice(0, 1) + '**'`。"""
    return str(cid)[:1] + "**"


@router.get("")
async def list_staff(
    type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> JSJSONResponse:
    try:
        # 与「管制员管理」使用同一数据源，保证公示与管理页人员完全一致
        if type == "controller":
            sql = (
                f"SELECT {_STAFF_COLS} FROM `Staff` "
                "WHERE department LIKE '%Control%' ORDER BY cid ASC"
            )
        else:
            sql = f"SELECT {_STAFF_COLS} FROM `Staff` ORDER BY cid ASC"
        rows = (await db.execute(text(sql))).all()

        data = []
        for row in rows:
            item = dict(row._mapping)
            item["active"] = bool(item.get("active"))
            item["online"] = bool(item.get("online"))
            item["cid"] = mask_cid(item.get("cid"))
            data.append(item)
        return JSJSONResponse({"success": True, "data": data})
    except Exception as exc:  # noqa: BLE001
        log.error("[Staff] 查询失败: %s", exc)
        return JSJSONResponse({"success": False, "message": "查询失败"}, status_code=500)


__all__ = ["router"]
