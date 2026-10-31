"""性能对比：2 worker + Redis + worker 进程后，对比单 worker 基线。"""

import asyncio
import random
import time

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
BASE = "http://127.0.0.1:3001"


def headers() -> dict:
    return {
        "User-Agent": UA,
        # 随机真实 IP，绕开按 IP 限流/地区限制，测真实处理能力
        "X-Real-IP": f"10.{random.randint(0, 254)}.{random.randint(0, 254)}.{random.randint(1, 254)}",
    }


async def bench(url: str, n: int, conc: int) -> None:
    lat: list[float] = []
    sem = asyncio.Semaphore(conc)
    err = 0
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        async def one() -> None:
            nonlocal err
            async with sem:
                t0 = time.perf_counter()
                try:
                    r = await client.get(url, headers=headers())
                    if r.status_code >= 500:
                        err += 1
                except Exception:  # noqa: BLE001
                    err += 1
                lat.append((time.perf_counter() - t0) * 1000)

        t0 = time.perf_counter()
        await asyncio.gather(*(one() for _ in range(n)))
        wall = time.perf_counter() - t0
    lat.sort()
    print(
        f"  {url:30} conc={conc:<3} {n/wall:7.1f} req/s  p50={lat[len(lat)//2]:6.1f}ms  "
        f"p95={lat[int(len(lat)*0.95)]:6.1f}ms  err={err}"
    )


async def page_load() -> None:
    """模拟前端进入页面时并发发起的 12 个 API 请求（含鉴权接口用公开 GET 代替）。"""
    paths = [
        "/api/events", "/api/staff", "/api/controllers", "/api/forum/boards",
        "/api/content/search?q=a", "/api/training/courses", "/api/points/leaderboard",
        "/api/dashboard/stats", "/api/weather?icao=ZBAA", "/api/auth/check-admin",
        "/api/content", "/api/meetings",
    ]
    sem = asyncio.Semaphore(12)
    lat: list[float] = []
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        async def one(p: str) -> None:
            async with sem:
                t0 = time.perf_counter()
                try:
                    await client.get(p, headers=headers())
                except Exception:  # noqa: BLE001
                    pass
                lat.append((time.perf_counter() - t0) * 1000)

        for _ in range(5):  # 5 轮
            t0 = time.perf_counter()
            await asyncio.gather(*(one(p) for p in paths))
            wall = (time.perf_counter() - t0) * 1000
            print(f"  第 {_+1} 轮：12 个并发请求全部完成耗时 {wall:7.1f} ms（最慢单请求 {max(lat):.1f} ms）")
            lat.clear()


async def main() -> None:
    print("=== 吞吐 / 延迟（2 worker）===")
    for url in ("/health", "/api/auth/check-cid?cid=0000", "/api/events"):
        await bench(url, 300, 10)
    await bench("/api/events", 600, 30)
    print()
    print("=== 页面首屏并发（12 请求）===")
    await page_load()


asyncio.run(main())
