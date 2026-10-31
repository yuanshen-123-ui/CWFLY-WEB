"""/api/controllers 路由（逐接口对齐 Node src/routes/controllers.js）。

GET /api/controllers —— 管制员公示名单（公开）
- 数据源 Staff 表（与 /api/staff?type=controller 同源）
  department 既可能是英文 "Control"，也可能是中文 "管制部/区域管制"，两种都匹配
- 在线状态以 FSD 的 FlightController 在线快照为准；快照表不可用时退回 Staff.online
- CID 是平台登录主键，公开列表只保留首位（掩码）
- 出错时与 Node 一致：返回 200 + `{"success": true, "data": []}`
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.controllers")
router = APIRouter(prefix="/controllers", tags=["controllers"])

_STAFF_COLS = "cid, name, department, position, rating, active, online"


def mask_cid(cid: Any) -> str:
    """`String(cid).slice(0, 1) + '**'`。"""
    return str(cid)[:1] + "**"


@router.get("")
async def list_controllers(db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        rows = (
            await db.execute(
                text(
                    f"SELECT {_STAFF_COLS} FROM `Staff` "
                    "WHERE department LIKE '%Control%' OR department LIKE '%管制%' "
                    "ORDER BY cid ASC"
                )
            )
        ).all()

        online_cids: set[str] = set()
        try:
            fc_rows = (await db.execute(text("SELECT cid FROM `FlightController`"))).all()
            online_cids = {str(r._mapping["cid"]) for r in fc_rows}
        except Exception:  # noqa: BLE001
            # 快照表不可用时退回 Staff.online 字段
            online_cids = set()

        data = [
            {
                "cid": mask_cid(r._mapping["cid"]),
                "name": r._mapping["name"],
                "department": r._mapping["department"],
                "position": r._mapping["position"],
                "rating": r._mapping["rating"],
                "online": (str(r._mapping["cid"]) in online_cids) or bool(r._mapping["online"]),
            }
            for r in rows
        ]
        return JSJSONResponse({"success": True, "data": data})
    except Exception as exc:  # noqa: BLE001
        log.error("[controllers] 查询失败: %s", exc)
        return JSJSONResponse({"success": True, "data": []})


__all__ = ["router", "mask_cid"]
