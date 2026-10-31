"""Alembic 异步环境（baseline：只用于记录版本，不自动改既有表结构）。

⚠️ 迁移纪律（与 Node/Prisma 共存期间）
- 现有 51 张表由 Prisma 创建，**禁止**用 `--autogenerate` 修改既有列类型/列名；
- 需要新增表/列时手写 migration；
- 首次接入：`alembic stamp 0001_baseline`（把当前库标记为 baseline，不执行任何 DDL）。
"""
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 连接串（mysql+asyncmy://...），不写进 alembic.ini
config.set_main_option("sqlalchemy.url", settings.async_database_url)

target_metadata = None  # P0 无 ORM 元数据；P2 补模型后可指向 Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.async_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=False)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
