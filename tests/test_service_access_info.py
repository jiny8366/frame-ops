"""service_access_info — 문구에 필수 키 이름 포함."""

from __future__ import annotations

from lib.service_access_info import (
    ACCESS_MARKDOWN_HQ,
    ACCESS_MARKDOWN_HQ_DASH,
    ACCESS_MARKDOWN_SALES,
    DEFAULT_LOCAL_URL,
)


def test_default_local_url() -> None:
    assert DEFAULT_LOCAL_URL.startswith("http")


def test_markdown_mentions_keys() -> None:
    assert "SUPABASE_SERVICE_ROLE_KEY" in ACCESS_MARKDOWN_HQ
    assert "SUPABASE_ANON_KEY" in ACCESS_MARKDOWN_SALES
    assert "localhost" in ACCESS_MARKDOWN_HQ_DASH.lower() or "8502" in ACCESS_MARKDOWN_HQ_DASH
