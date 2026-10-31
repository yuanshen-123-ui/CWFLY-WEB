"""weather 缓存共享层：Redis（多 worker 共享）+ 进程内兜底。

目的：worker 定时预热把热门机场 METAR/TAF 写进 Redis，API 的 2 个 uvicorn worker
首次请求直接命中缓存（原来每个 worker 首次都要外呼 AWC/VATSIM，单次 1.3s+）。
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Optional

log = logging.getLogger("cwfly.weather_cache")

_PREFIX = "cwfly:weather:"
_redis = None
_redis_checked = False
_memory: dict[str, tuple[float, str]] = {}


def _client():
    global _redis, _redis_checked
    if _redis_checked:
        return _redis
    _redis_checked = True
    url = os.getenv("SOCKETIO_REDIS_URL", "").strip()
    if not url:
        return None
    try:
        import redis  # type: ignore

        _redis = redis.Redis.from_url(url, socket_timeout=0.3, socket_connect_timeout=0.3)
        _redis.ping()
        log.info("[WeatherCache] Redis 缓存已启用")
    except Exception as exc:  # noqa: BLE001
        log.warning("[WeatherCache] Redis 不可用，回退进程内缓存: %s", exc)
        _redis = None
    return _redis


def get(code: str) -> Optional[dict[str, Any]]:
    key = _PREFIX + code.upper()
    client = _client()
    if client is not None:
        try:
            raw = client.get(key)
            if raw:
                return json.loads(raw)
        except Exception:  # noqa: BLE001
            pass
    hit = _memory.get(key)
    if hit and hit[0] > time.time():
        try:
            return json.loads(hit[1])
        except Exception:  # noqa: BLE001
            return None
    return None


def put(code: str, payload: dict[str, Any], ttl_ms: int) -> None:
    key = _PREFIX + code.upper()
    try:
        raw = json.dumps(payload, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        return
    client = _client()
    if client is not None:
        try:
            client.set(key, raw, px=max(int(ttl_ms), 1000))
        except Exception:  # noqa: BLE001
            pass
    if len(_memory) > 500:
        _memory.clear()
    _memory[key] = (time.time() + ttl_ms / 1000.0, raw)


def cached_age_ms(code: str) -> Optional[int]:
    """缓存剩余有效期（毫秒），没有则 None。"""
    key = _PREFIX + code.upper()
    client = _client()
    if client is not None:
        try:
            ttl = client.pttl(key)
            if ttl and ttl > 0:
                return int(ttl)
        except Exception:  # noqa: BLE001
            pass
    hit = _memory.get(key)
    if hit:
        left = (hit[0] - time.time()) * 1000
        return int(left) if left > 0 else None
    return None


__all__ = ["get", "put", "cached_age_ms"]
