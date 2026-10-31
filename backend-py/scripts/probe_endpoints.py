"""逐接口延迟测量：找出「进页面 loading 半天」的慢接口。"""

import asyncio
import random
import statistics
import time

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BASE = "http://127.0.0.1:3001"
PATHS = [
    "/health",
    "/api/auth/check-admin",
    "/api/events", "/api/events/my", "/api/events/my-registrations",
    "/api/staff", "/api/controllers", "/api/forum/boards", "/api/content",
    "/api/content/search?q=a", "/api/training/courses", "/api/points/leaderboard",
    "/api/dashboard/stats", "/api/weather?icao=ZBAA", "/api/meetings",
    "/api/notifications", "/api/tickets", "/api/flightplans/fsd/boundaries",
    "/whazzup.json",
]


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        print(f"  {'path':40} {'status':6} {'p50':>8} {'p95':>8} {'max':>8}  size")
        for path in PATHS:
            lat = []
            size = 0
            code = 0
            for _ in range(10):
                headers = {
                    "User-Agent": UA,
                    "X-Real-IP": "106.91.80.171",  # 白名单内（国内）IP，测真实成功路径
                }
                t0 = time.perf_counter()
                r = await client.get(path, headers=headers)
                lat.append((time.perf_counter() - t0) * 1000)
                code = r.status_code
                size = len(r.content)
            lat.sort()
            print(
                f"  {path:40} {code:<6} {lat[len(lat)//2]:7.1f}ms {lat[int(len(lat)*0.95)]:7.1f}ms "
                f"{lat[-1]:7.1f}ms  {size/1024:.1f}KB"
            )


asyncio.run(main())
