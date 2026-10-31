"""环境变量读取（对齐 Node `import 'dotenv/config'` 的语义）。

为什么需要这个文件：
`app/config.py`（不在本人可改范围）用 pydantic-settings 只把 **已声明字段** 读进
Settings 对象，未声明键会被 `extra="ignore"` 丢弃，且 **不会写回 os.environ**。
而 Node 版 `dotenv/config` 是把 `.env` 灌进 `process.env`，随后代码里
`process.env.FSD_HOST` / `SECURITY_RETENTION_HOURS` / `FP_SIG_TTL_MS` … 都能读到。

本模块复刻该行为：先看真实进程环境变量，再回退到 `.env` 文件解析结果，
使移植后的模块在「只配 .env / 只导出环境变量 / 两者都有」三种部署方式下都与 Node 一致。

归属：实时通道 + 定时任务 + 共享服务层（本人任务文件）。
"""
from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Dict, Optional

# backend-py/ 根目录（app/services/env_compat.py → parents[2]）
PROJECT_ROOT: Path = Path(__file__).resolve().parents[2]

_DOTENV: Optional[Dict[str, str]] = None
_LOCK = threading.Lock()


def _dotenv_candidates() -> list[Path]:
    # Node 版 dotenv 只在 cwd 找 .env；这里额外兜住「cwd 不是 backend-py」的启动方式
    return [Path.cwd() / ".env", PROJECT_ROOT / ".env"]


def _parse_dotenv(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        raw = path.read_text(encoding="utf-8-sig", errors="replace")
    except Exception:
        return out
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        # 与 dotenv 一致：成对引号去壳，其余原样保留（含 # 与空格）
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        out.setdefault(key, value)
    return out


def dotenv_values() -> Dict[str, str]:
    """惰性解析 .env（进程内只读一次，失败返回空 dict，绝不抛错）。"""
    global _DOTENV
    if _DOTENV is not None:
        return _DOTENV
    with _LOCK:
        if _DOTENV is not None:
            return _DOTENV
        merged: Dict[str, str] = {}
        for path in _dotenv_candidates():
            merged.update(_parse_dotenv(path))
        _DOTENV = merged
        return _DOTENV


def env_str(name: str, default: str = "") -> str:
    """`process.env.NAME || default`（空串视为未设置，与 JS `||` 一致）。"""
    value = os.environ.get(name)
    if value is None or value == "":
        value = dotenv_values().get(name, "")
    return value if value not in (None, "") else default


def env_raw(name: str) -> Optional[str]:
    """原样取值（不把空串当未设置），用于需要区分「未配置」的场景。"""
    if name in os.environ:
        return os.environ[name]
    return dotenv_values().get(name)


def env_int(name: str, default: int) -> int:
    raw = env_str(name, "")
    if not raw:
        return default
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        # Node `Number(x) || default` 对 NaN 回退默认值
        return default


def env_float(name: str, default: float) -> float:
    raw = env_str(name, "")
    if not raw:
        return default
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return default


def env_bool(name: str, default: bool = False) -> bool:
    raw = env_str(name, "")
    if not raw:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


__all__ = [
    "PROJECT_ROOT",
    "dotenv_values",
    "env_str",
    "env_raw",
    "env_int",
    "env_float",
    "env_bool",
]
