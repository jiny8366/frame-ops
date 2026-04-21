"""정산 가드 — Mock Supabase / Streamlit."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError

from lib.settlement_guard import (
    is_business_day_settled,
    settled_warning_message,
    stop_if_settlement_migration_missing,
)


def test_settled_warning_message_contains_date() -> None:
    d = date(2026, 5, 1)
    msg = settled_warning_message(d)
    assert "2026-05-01" in msg
    assert "정산" in msg


def test_is_business_day_settled_true_when_row_exists() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = MagicMock(data=[{"id": "x"}])
    assert is_business_day_settled(sb, "store-1", date(2026, 4, 10)) is True
    chain.eq.assert_called()


def test_is_business_day_settled_false_when_empty() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value = MagicMock(data=[])
    assert is_business_day_settled(sb, "store-1", date(2026, 4, 10)) is False


def test_is_business_day_settled_false_on_missing_table() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.execute.side_effect = APIError(
        {"code": "PGRST205", "message": "Could not find the table"}
    )
    assert is_business_day_settled(sb, "s", date(2026, 1, 1)) is False


def test_stop_if_settlement_migration_missing_stops_on_pgrst205(monkeypatch: pytest.MonkeyPatch) -> None:
    import lib.settlement_guard as sg

    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.limit.return_value = chain
    chain.execute.side_effect = APIError(
        {"code": "PGRST205", "message": "Could not find the table fo_settlements"}
    )

    mock_err = MagicMock()
    monkeypatch.setattr(sg.st, "error", mock_err)
    monkeypatch.setattr(sg.st, "stop", lambda: (_ for _ in ()).throw(RuntimeError("streamlit_stop")))

    with pytest.raises(RuntimeError, match="streamlit_stop"):
        stop_if_settlement_migration_missing(sb)
    mock_err.assert_called_once()
