import asyncio
import random
import time

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
URLS = ["/health", "/api/auth/check-cid?cid=0000", "/api/events"]
N = 300
CONC = 10


async def bench(base: str, url: str) -> dict:
    lat: list[float] = []
    sem = asyncio.Semaphore(CONC)
    err = 0
    mapped = 0

    async with httpx.AsyncClient(base_url=base, headers={"User-Agent": UA}, timeout=30.0) as client:
        async def one() -> None:
            nonlocal err, mapped
            async with sem:
                # 随机 X-Real-IP：绕开按 IP 的限流，保证测到真实处理耗时
                ip = f"10.{random.randint(0,254)}.{random.randint(0,254)}.{random.randint(1,254)}"
                t0 = time.perf_counter()
                try:
                    r = await client.get(url, headers={"X-Real-IP": ip})
                    if r.status_code == 429:
                        mapped += 1
                    elif r.status_code >= 500:
                        err += 1
                except Exception:  # noqa: BLE001
                    err += 1
                lat.append((time.perf_counter() - t0) * 1000)

        t0 = time.perf_counter()
        await asyncio.gather(*(one() for _ in range(N)))
        wall = time.perf_counter() - t0

    lat.sort()
    return {
        "url": url,
        "rps": N / wall,
        "mean": sum(lat) / len(lat),
        "p50": lat[int(len(lat) * 0.5)],
        "p95": lat[int(len(lat) * 0.95)],
        "err": err,
        "429": mapped,
    }


async def main() -> None:
    for name, base in (("Node ", "http://127.0.0.1:3000"), ("Python", "http://127.0.0.1:3001")):
        print(f"=== {name} ({base}) ===")
        for url in URLS:
            try:
                r = await bench(base, url)
                print(
                    f"  {url:34} {r['rps']:7.1f} req/s  mean={r['mean']:6.1f}ms  "
                    f"p50={r['p50']:6.1f}ms  p95={r['p95']:6.1f}ms  err={r['err']}  429={r['429']}"
                )
            except Exception as exc:  # noqa: BLE001
                print(f"  {url:34} FAIL {exc}")


asyncio.run(main())
