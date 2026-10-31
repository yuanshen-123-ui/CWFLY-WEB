"""异步数据库会话（SQLAlchemy 2.0 + asyncmy，连接同一个 MySQL 库）。"""
from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    settings.async_database_url,
    pool_size=max(settings.DB_CONNECTION_LIMIT, 15),
    max_overflow=max(settings.DB_CONNECTION_LIMIT, 15),
    pool_pre_ping=True,
    pool_recycle=1800,
    echo=False,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖：请求级会话（异常自动回滚）。"""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()


__all__ = ["engine", "SessionLocal", "get_db", "dispose_engine"]
