"""后台工作者进程（PM2: cwfly-worker-py）：只跑定时任务/预热，不提供 HTTP。

与 API 进程（cwfly-api-py，uvicorn --workers N）分进程的目的：
- API 事件循环不被 whazzup 解析、FSD 轮询、数据库备份等周期性任务阻塞（避免偶发请求卡顿）；
- 定时任务只跑一份，不受 API worker 数量影响。
"""
from __future__ import annotations

import asyncio
import logging
import signal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("cwfly.worker")


POPULAR_ICAOS = (
    "ZBAA", "ZSPD", "ZGGG", "ZUUU", "ZSSS",
    "ZHHH", "ZSNJ", "ZLXY", "ZPPP", "ZSHC",
)


async def _weather_preheat_loop() -> None:
    """每 55s 预热热门机场天气到共享缓存（API worker 首请求直接命中）。"""
    from app.services import weather_sources as ws

    while True:
        try:
            for code in POPULAR_ICAOS:
                try:
                    payload = await ws.fetch_payload(code)
                    # 预热写入更长 TTL（180s），避免 55s 循环与 60s TTL 之间的空窗
                    ws.cache_put(code, payload, 180 * 1000)
                except Exception:  # noqa: BLE001
                    pass
            log.info("[Worker] 天气预热完成（%d 个机场）", len(POPULAR_ICAOS))
        except Exception as exc:  # noqa: BLE001
            log.warning("[Worker] 天气预热失败: %s", exc)
        await asyncio.sleep(40)


async def main() -> None:
    from app.db.session import dispose_engine
    from app.jobs.scheduler import start_jobs, stop_jobs, warmup
    from app.middleware.ip_ban import preload_bans
    from app.services.bootstrap import init_admin

    await init_admin()
    await preload_bans()
    try:
        await warmup()  # 名单预热 + 首轮 whazzup
    except Exception as exc:  # noqa: BLE001
        log.warning("[Worker] 预热失败: %s", exc)

    start_jobs()
    asyncio.create_task(_weather_preheat_loop())
    log.info("[Worker] 后台任务已启动（含天气预热）")

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:  # Windows
            pass
    try:
        await stop_event.wait()
    finally:
        log.info("[Worker] 收到退出信号，停止后台任务")
        try:
            await stop_jobs()
        except Exception:  # noqa: BLE001
            pass
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
