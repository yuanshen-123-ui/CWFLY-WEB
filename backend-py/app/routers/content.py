"""/api/content 路由（逐接口对齐 Node src/routes/content.js）。

公开接口（Node 里虽然没有使用 authenticate，但同样无鉴权）：
- GET /knowledge?category=      知识库列表（仅已发布，id desc）
- GET /knowledge/:id            知识库详情（仅已发布；先返回旧 views 再 +1，与 Node 一致）
- GET /search?q=                全局搜索（events / posts / airports / knowledge，各 10 条）
- GET /?icao=                   机场列表（icao asc）
- GET /:icao                    机场详情（缺失频率/跑道时从 OpenAIP 同步）

注意路由顺序：/knowledge、/knowledge/:id、/search 必须声明在 /:icao 之前。
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import content_service as cs
from app.services.js_compat_service import js_contains_pattern, js_int
from app.utils.json_compat import JSJSONResponse

log = logging.getLogger("cwfly.content")
router = APIRouter(prefix="/content", tags=["content"])


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


def _parse_json(raw: Any) -> Any:
    """对齐 Node ``try { v = JSON.parse(raw) } catch {}``（失败保持 []）。"""
    if raw is None:
        return []
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return []


def _is_empty_length(value: Any) -> bool:
    """对齐 JS ``value.length === 0``：只有数组/字符串才有 length，对象是 undefined≠0。"""
    if isinstance(value, (list, str)):
        return len(value) == 0
    return False


# ============================ 知识库 ============================
@router.get("/knowledge")
async def knowledge_list(
    category: str | None = None, db: AsyncSession = Depends(get_db)
) -> JSJSONResponse:
    try:
        return _ok(await cs.list_knowledge(db, category or None))
    except Exception as exc:  # noqa: BLE001
        log.error("[content.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/knowledge/{kb_id}")
async def knowledge_detail(kb_id: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        item = await cs.get_published_knowledge(db, js_int(kb_id))
        if not item:
            return _fail(404, "不存在")
        # Node：先 update views+1，再把「未自增前」的 item 返回给前端
        views = int(item.get("views") or 0)
        await cs.set_knowledge_views(db, int(item["id"]), views + 1)
        return _ok(item)
    except Exception as exc:  # noqa: BLE001
        log.error("[content.py] %s", exc)
        return _fail(500, "操作失败")


# ============================ 全局搜索（必须先于 /:icao） ============================
@router.get("/search")
async def search(
    q: str | None = None, db: AsyncSession = Depends(get_db)
) -> JSJSONResponse:
    try:
        if not q:
            return _ok([])
        text_pattern = js_contains_pattern(q)
        events = await cs.search_events(db, text_pattern)
        posts = await cs.search_posts(db, text_pattern)
        airports = await cs.search_airports(
            db, js_contains_pattern(q, case="upper"), text_pattern
        )
        knowledge = await cs.search_knowledge(db, text_pattern)
        return _ok(
            {
                "events": events,
                "posts": posts,
                "airports": airports,
                "knowledge": knowledge,
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.error("[content.py] %s", exc)
        return _fail(500, "操作失败")


# ============================ 机场 ============================
@router.get("")
@router.get("/")
async def airport_list(
    icao: str | None = None, db: AsyncSession = Depends(get_db)
) -> JSJSONResponse:
    try:
        code = icao.upper() if icao else None
        return _ok(await cs.list_airports(db, code))
    except Exception as exc:  # noqa: BLE001
        log.error("[content.py] %s", exc)
        return _fail(500, "操作失败")


@router.get("/{icao}")
async def airport_detail(icao: str, db: AsyncSession = Depends(get_db)) -> JSJSONResponse:
    try:
        code = (icao or "").upper()
        ap = await cs.get_airport(db, code)
        from_openaip = False

        if ap:
            # 数据库有数据：缺频率/跑道时尝试用 OpenAIP 补齐
            frequencies = _parse_json(ap.get("frequencies"))
            runways = _parse_json(ap.get("runways"))
            if _is_empty_length(frequencies) or _is_empty_length(runways):
                oa_data = await cs.fetch_airport_by_icao(code)
                if oa_data:
                    normalized = cs.normalize_airport_data(oa_data)
                    if normalized:
                        await cs.save_airport_to_db(db, normalized)
                        ap = await cs.get_airport(db, code)
                        from_openaip = True
                        frequencies = _parse_json(ap.get("frequencies") if ap else None)
                        runways = _parse_json(ap.get("runways") if ap else None)
            data: dict[str, Any] = dict(ap or {})
            data["frequencies"] = frequencies
            data["runways"] = runways
            data["isMilitary"] = bool(ap.get("isMilitary") or False) if ap else False
            data["_source"] = "openaip" if from_openaip else "local"
            return _ok(data)

        # 数据库无该机场：尝试从 OpenAIP 拉取并落库
        oa_data = await cs.fetch_airport_by_icao(code)
        if oa_data:
            normalized = cs.normalize_airport_data(oa_data)
            if normalized:
                await cs.save_airport_to_db(db, normalized)
                saved = await cs.get_airport(db, code)
                data = dict(saved or {})
                data["frequencies"] = _parse_json(saved.get("frequencies") if saved else None)
                data["runways"] = _parse_json(saved.get("runways") if saved else None)
                data["_source"] = "openaip"
                return _ok(data)
        return _fail(404, "机场不存在")
    except Exception as exc:  # noqa: BLE001
        log.error("[content.py] %s", exc)
        return _fail(500, "操作失败")


__all__ = ["router"]
