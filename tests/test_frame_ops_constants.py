"""FRAME OPS 상수 — DB·Streamlit 실행 없이 검증."""

from __future__ import annotations

from datetime import date

import pytest


def test_get_data_entry_start_date_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRAME_OPS_DATA_START_DATE", raising=False)
    from lib.constants import get_data_entry_start_date

    assert get_data_entry_start_date() == date(2026, 4, 1)


def test_get_data_entry_start_date_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_DATA_START_DATE", "2025-01-15")
    from lib.constants import get_data_entry_start_date

    assert get_data_entry_start_date() == date(2025, 1, 15)


def test_get_data_entry_start_date_invalid_env_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_DATA_START_DATE", "not-a-date")
    from lib.constants import get_data_entry_start_date

    assert get_data_entry_start_date() == date(2026, 4, 1)
