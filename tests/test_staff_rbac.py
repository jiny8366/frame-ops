"""staff_rbac — JWT role 디코드 등 DB 없는 검증."""

from __future__ import annotations

import base64
import json

import pytest


def _b64url(obj: dict) -> str:
    raw = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def test_supabase_jwt_role_reads_payload() -> None:
    from lib.staff_rbac import supabase_jwt_role

    body = _b64url({"role": "service_role", "exp": 9999999999})
    token = f"e30.{body}.sig"
    assert supabase_jwt_role(token) == "service_role"


def test_supabase_jwt_role_invalid() -> None:
    from lib.staff_rbac import supabase_jwt_role

    assert supabase_jwt_role("not-a-jwt") is None
    assert supabase_jwt_role("") is None


def test_staff_rbac_module_importable() -> None:
    import lib.staff_rbac as m  # noqa: F401

    assert hasattr(m, "create_staff_user")
