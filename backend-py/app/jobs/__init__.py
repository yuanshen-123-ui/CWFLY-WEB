"""定时任务包。

对外导出（lifespan 接线用）：
    start_jobs()    同步：在运行中的事件循环里创建全部后台任务（幂等）
    stop_jobs()     异步：取消并等待全部后台任务退出
    jobs_status()   排障用：当前任务名/是否存活
"""
from __future__ import annotations

from app.jobs.scheduler import (
    jobs_status,
    start_jobs,
    stop_jobs,
    warmup,
)

__all__ = ["start_jobs", "stop_jobs", "jobs_status", "warmup"]
