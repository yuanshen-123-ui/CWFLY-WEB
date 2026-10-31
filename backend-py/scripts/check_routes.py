"""路由对账：Python 已注册路由 vs Node 端点（按 routes/index.js 的挂载前缀计算）。

用法：cd D:\\CWFLY\\backend-py && .\\.venv\\Scripts\\python.exe scripts\\check_routes.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app  # noqa: E402

NODE_ROUTES = Path(r"D:\CWFLY\backend\src\routes")
INDEX = NODE_ROUTES / "index.js"

METHOD_RE = re.compile(r"router\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]*)['\"]")
MOUNT_RE = re.compile(r"router\.use\(\s*['\"](/[^'\"]*)['\"]\s*,\s*(\w+)")


def node_endpoints() -> set[tuple[str, str]]:
    mounts: dict[str, str] = {}
    index_text = INDEX.read_text(encoding="utf-8")
    for m in MOUNT_RE.finditer(index_text):
        prefix, module = m.group(1), m.group(2)
        file_map = {
            "authRoutes": "auth", "dashboardRoutes": "dashboard", "eventsRoutes": "events",
            "checkinRoutes": "checkin", "profileRoutes": "profile", "weatherRoutes": "weather",
            "feedbackRoutes": "feedback", "applyRoutes": "apply", "staffRoutes": "staff",
            "meetingsRoutes": "meetings", "controllersRoutes": "controllers",
            "flightplanRoutes": "flightplans", "ticketRoutes": "tickets", "verifyRoutes": "verify",
            "chartRoutes": "charts", "notificationRoutes": "notifications", "forumRoutes": "forum",
            "contentRoutes": "content", "pointsRoutes": "points", "trainingRoutes": "training",
            "adminRoutes": "admin", "securityRoutes": "security", "tracksRoutes": "tracks",
        }
        if module in file_map:
            mounts[file_map[module]] = prefix

    found: set[tuple[str, str]] = set()
    for js in NODE_ROUTES.glob("*.js"):
        name = js.stem
        if name == "index":
            continue
        prefix = mounts.get(name, "")
        text = js.read_text(encoding="utf-8", errors="replace")
        for mm in METHOD_RE.finditer(text):
            method = mm.group(1).upper()
            path = mm.group(2)
            full = (prefix + path).replace("//", "/")
            found.add((method, full))
    return found


def norm(path: str) -> str:
    path = re.sub(r"\{[^}]+\}", ":p", path)
    path = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", ":p", path)
    return path.rstrip("/") or "/"


def main() -> int:
    py: set[tuple[str, str]] = set()
    for route in app.routes:  # type: ignore[attr-defined]
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if not methods or not path:
            continue
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            py.add((method, norm(path)))

    node = node_endpoints()
    node_norm = {(m, norm("/api" + p)) for m, p in node}
    missing = sorted(node_norm - py)
    extra = sorted(py - node_norm - {("GET", "/health"), ("GET", "/whazzup.json")})

    print(f"Node 端点: {len(node)}（归一化 {len(node_norm)}）")
    print(f"Python 路由: {len(py)}")
    print(f"未覆盖: {len(missing)}")
    for m, p in missing:
        print(f"  {m:6} {p}")
    print(f"多出（Python 有 Node 无）: {len(extra)}")
    for m, p in extra[:30]:
        print(f"  {m:6} {p}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
