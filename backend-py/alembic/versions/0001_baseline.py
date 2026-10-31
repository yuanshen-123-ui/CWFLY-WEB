"""baseline：把「Prisma 已建好的当前库结构」标记为 Alembic 起点。

本文件**不包含任何 DDL**：
- 现有 51 张表由 Prisma 维护，Alembic 只负责从此处开始记录后续变更；
- 首次接入执行：`alembic stamp 0001_baseline`（只写 alembic_version 表，不动业务表）。

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-31
"""
from typing import Sequence, Union

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """baseline：不改结构（表由 Prisma 创建）。"""
    pass


def downgrade() -> None:
    """回退 baseline 不删任何业务表。"""
    pass
