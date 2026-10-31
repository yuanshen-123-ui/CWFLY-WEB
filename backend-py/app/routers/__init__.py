"""路由包：自动发现 app/routers/ 下所有定义了 `router` 的模块。

- 每个模块自行声明 `router = APIRouter(prefix="/xxx")`；
- 本文件由 Lead 维护，端口工程师不需要修改；
- 导入失败的模块会被记录并跳过（不会拖垮整个应用）。
"""
from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import Iterator

from fastapi import APIRouter

log = logging.getLogger("cwfly.routers")


def iter_routers() -> Iterator[APIRouter]:
    for info in pkgutil.iter_modules(__path__):  # type: ignore[name-defined]
        name = info.name
        if name.startswith("_"):
            continue
        try:
            module = importlib.import_module(f"{__name__}.{name}")
        except Exception as exc:  # noqa: BLE001
            log.error("[routers] 导入失败 %s: %s", name, exc)
            continue
        router = getattr(module, "router", None)
        if isinstance(router, APIRouter):
            yield router
        else:
            log.warning("[routers] %s 未定义 router，已跳过", name)


__all__ = ["iter_routers"]
