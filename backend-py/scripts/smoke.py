"""离线冒烟：用 httpx ASGITransport 直接打 app（无需启动 uvicorn、不占端口）。

做法：自动枚举所有「无路径参数」的 GET 路由，分别带 Admin token 调用一次，
      再单独验证公开端点与 401/404 行为。失败（5xx/异常）会被列出。

用法：
    cd D:\\CWFLY\\backend-py
    .\\.venv\\Scripts\\python.exe scripts\\smoke.py
"""
from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.main import app  # noqa: E402
from app.services.token import sign_token  # noqa: E402

TOKEN = sign_token(
    {"cid": "0000", "username": "管理员", "rating": 12, "permissions": "user,flightplan,event,controller,staff,ticket,online", "fsdLevel": 12}
)
AUTH = {"Authorization": f"Bearer {TOKEN}"}

SKIP_PREFIX = ("/api/admin",)  # admin 会写库操作，冒烟只做读；需要时单独测


def collect_get_routes() -> list[str]:
    out = []
    for route in app.routes:  # type: ignore[attr-defined]
        methods = getattr(route, "methods", None)
        path = getattr(route, "path", None)
        if not methods or not path or "GET" not in methods:
            continue
        if path in {"/openapi.json", "/docs", "/redoc"}:
            continue
        if "{" in path or path.endswith("/{plan_id}"):
            continue
        if path.startswith(SKIP_PREFIX):
            continue
        out.append(path)
    return sorted(set(out))


async def main() -> int:
    failures: list[str] = []
    transport = httpx.ASGITransport(app=app)
    paths = collect_get_routes()
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30) as client:
        print(f"=== 无参数 GET 路由：{len(paths)} 条（带 Admin token）===")
        for path in paths:
            try:
                resp = await client.get(path, headers=AUTH)
                ok = resp.status_code < 500
                if not ok:
                    failures.append(f"{path} -> {resp.status_code} {resp.text[:80]}")
                print(f"  {path:46} {resp.status_code} {'OK' if ok else 'FAIL'}")
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{path} EXC {exc}")
                print(f"  {path:46} EXC")

        print("=== 关键行为 ===")
        checks = [
            ("GET", "/health", None),
            ("GET", "/api/auth/check-cid?cid=0000", None),
            ("GET", "/api/auth/me", None),
            ("GET", "/api/nope-should-404", None),
        ]
        for method, url, headers in checks:
            resp = await client.request(method, url, headers=headers or {})
            print(f"  {url:44} {resp.status_code}  {resp.text[:80]}")

    print()
    if failures:
        print(f"失败 {len(failures)} 项：")
        for item in failures:
            print("  " + item)
        return 1
    print("全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
