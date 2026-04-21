"""Supabase URL 판별 등 — 네트워크 없음."""

from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    ("url", "remote"),
    [
        ("https://abcd.supabase.co", True),
        ("https://abcd.supabase.co/", True),
        ("http://127.0.0.1:54321", False),
        ("http://localhost:54321", False),
        ("http://[::1]:54321", False),
        ("https://dev.example.local", False),
        ("", False),
        ("ftp://x", False),
    ],
)
def test_is_probably_remote_supabase(url: str, remote: bool) -> None:
    from lib.supabase_client import is_probably_remote_supabase

    assert is_probably_remote_supabase(url) is remote
