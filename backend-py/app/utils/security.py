"""密码 / 权限 / 哈希工具（与 Node 版保持同一套存储格式）。"""
from __future__ import annotations

import hashlib
from typing import Any, Iterable

import bcrypt

# ---------------- 权限（对齐 src/config/permissions.js） ----------------
PERMISSIONS: dict[str, str] = {
    "USER": "user",
    "FLIGHTPLAN": "flightplan",
    "EVENT": "event",
    "CONTROLLER": "controller",
    "STAFF": "staff",
    "TICKET": "ticket",
    "ONLINE": "online",
}
ALL_PERMISSIONS: list[str] = list(PERMISSIONS.values())


def perms_to_string(perms: Iterable[str]) -> str:
    return ",".join(dict.fromkeys(p for p in perms if p in ALL_PERMISSIONS))


def string_to_perms(value: str | None) -> list[str]:
    if not value:
        return []
    return [p for p in value.split(",") if p in ALL_PERMISSIONS]


def has_permission(user: dict[str, Any] | None, perm: str) -> bool:
    """rating >= 11（管理员）自动拥有所有权限。"""
    if not user:
        return False
    if (user.get("rating") or 0) >= 11:
        return True
    return perm in string_to_perms(user.get("permissions"))


def has_any_permission(user: dict[str, Any] | None) -> bool:
    if not user:
        return False
    return len(string_to_perms(user.get("permissions"))) > 0


# ---------------- 密码（bcrypt，兼容老 hash） ----------------
def hash_password(password: str) -> str:
    """bcrypt cost=12，与 Node `bcrypt.hash(password, 12)` 输出格式一致（$2b$/60 字节）。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, stored_hash: str | None) -> bool:
    """校验 Node bcryptjs 生成的 hash（$2a$ / $2b$ / cost 任意）。"""
    if not stored_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def sha256_hex(password: str) -> str:
    """供 FSD 挑战-响应认证使用（与 Node createHash('sha256') 一致）。"""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# ---------------- 密码策略（对齐 src/routes/auth.js validatePassword） ----------------
WEAK_PASSWORDS = {
    "12345678", "123456789", "1234567890", "password", "password1", "password123",
    "qwerty123", "qwertyuiop", "11111111", "00000000", "66666666", "88888888",
    "12341234", "11223344", "abcd1234", "a1234567", "abc12345", "1q2w3e4r",
    "iloveyou", "sunshine", "letmein1", "cwfly123", "cwfly1234",
}


def validate_password(password: Any) -> str:
    """通过返回空串，不通过返回与 Node 完全一致的中文提示。"""
    if not isinstance(password, str) or len(password) < 8 or len(password) > 64:
        return "密码长度需为 8-64 位"
    if not any(c.isalpha() and c.isascii() for c in password) or not any(c.isdigit() for c in password):
        return "密码需同时包含字母和数字"
    if password.lower() in WEAK_PASSWORDS:
        return "密码过于常见，请更换"
    return ""


__all__ = [
    "PERMISSIONS",
    "ALL_PERMISSIONS",
    "perms_to_string",
    "string_to_perms",
    "has_permission",
    "has_any_permission",
    "hash_password",
    "verify_password",
    "sha256_hex",
    "validate_password",
]
