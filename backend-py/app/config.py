"""配置：与 Node 版 config/index.js 完全同名的环境变量。"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_duration_seconds(value: str, default: int = 600) -> int:
    """把 jsonwebtoken 风格的 '10m' / '600s' / '1h' 解析成秒。"""
    if not value:
        return default
    m = re.fullmatch(r"\s*(\d+)\s*([smhd]?)\s*", value)
    if not m:
        return default
    n = int(m.group(1))
    unit = m.group(2) or "s"
    return n * {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ---- 基础 ----
    NODE_ENV: str = "development"
    PORT: int = 3000

    # ---- 数据库（与 Node 同一个 mysql:// URL）----
    DATABASE_URL: str = "mysql://root:password@localhost:3306/cwfly"
    DB_CONNECTION_LIMIT: int = 5

    # ---- JWT（与 Node 完全一致）----
    JWT_SECRET: str = ""
    JWT_EXPIRES: str = "10m"
    JWT_REFRESH_GRACE_SECONDS: int = 600
    JWT_REFRESH_BEFORE_SECONDS: int = 120

    # ---- CORS ----
    CORS_ORIGIN: Optional[str] = None

    # ---- 管理员初始化 ----
    ADMIN_PASSWORD: Optional[str] = None

    # ---- 邮件 ----
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "CW 模拟飞行"
    FRONTEND_URL: str = "http://localhost:5173"

    # ---- 第三方 ----
    OPENAPI_KEY: str = ""
    TURNSTILE_SECRET_KEY: str = ""
    FSD_WHAZZUP_FILE: str = ""
    FSD_SYS_CID: str = ""
    FSD_SYS_PASSWORD: str = ""

    @property
    def is_prod(self) -> bool:
        return self.NODE_ENV == "production"

    @property
    def cors_origin(self) -> str:
        """与 Node 一致的 CORS 回退逻辑（生产不再回退到 localhost）。"""
        if self.CORS_ORIGIN:
            return self.CORS_ORIGIN
        return "https://www.cwflysim.cn" if self.is_prod else "http://localhost:5173"

    @property
    def jwt_expires_seconds(self) -> int:
        return parse_duration_seconds(self.JWT_EXPIRES, 600)

    @property
    def async_database_url(self) -> str:
        """mysql:// → mysql+asyncmy://（同一个库、同一套表，不改结构）。"""
        url = self.DATABASE_URL
        if url.startswith("mysql://"):
            url = "mysql+asyncmy://" + url[len("mysql://") :]
        elif url.startswith("mariadb://"):
            url = "mysql+asyncmy://" + url[len("mariadb://") :]
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}charset=utf8mb4"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # 与 Node 版一致的安全门禁：密钥缺失/过短直接拒绝启动
    if not s.JWT_SECRET or s.JWT_SECRET == "cwfly-secret-key-2024" or len(s.JWT_SECRET) < 32:
        raise RuntimeError(
            "安全错误: JWT_SECRET 环境变量未设置或过短（需 >= 32 字符的随机密钥）"
        )
    return s


settings = get_settings()
