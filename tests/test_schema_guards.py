"""스키마 가드 — 재고·반품 마이그레이션 감지 (Mock)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError

from lib.schema_guard import stop_if_inventory_migration_missing
from lib.schema_guard_extended import stop_if_returns_migration_missing


def test_stop_if_inventory_migration_missing_stops_on_pgrst205(monkeypatch: pytest.MonkeyPatch) -> None:
    import lib.schema_guard as mod

    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.limit.return_value = chain
    chain.execute.side_effect = APIError(
        {"code": "PGRST205", "message": "Could not find the table"}
    )
    mock_err = MagicMock()
    monkeypatch.setattr(mod.st, "error", mock_err)
    monkeypatch.setattr(mod.st, "stop", lambda: (_ for _ in ()).throw(RuntimeError("stop")))

    with pytest.raises(RuntimeError, match="stop"):
        stop_if_inventory_migration_missing(sb)
    mock_err.assert_called_once()
    sb.table.assert_called_with("fo_inbound_receipts")


def test_stop_if_inventory_migration_missing_reraises_other_api_error() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.limit.return_value = chain
    chain.execute.side_effect = APIError({"code": "PGRST400", "message": "bad request"})

    with pytest.raises(APIError):
        stop_if_inventory_migration_missing(sb)


def test_stop_if_returns_migration_missing_stops_on_pgrst205(monkeypatch: pytest.MonkeyPatch) -> None:
    import lib.schema_guard_extended as mod

    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.limit.return_value = chain
    chain.execute.side_effect = APIError(
        {"code": "PGRST205", "message": "Could not find the table fo_returns"}
    )
    mock_err = MagicMock()
    monkeypatch.setattr(mod.st, "error", mock_err)
    monkeypatch.setattr(mod.st, "stop", lambda: (_ for _ in ()).throw(RuntimeError("stop")))

    with pytest.raises(RuntimeError, match="stop"):
        stop_if_returns_migration_missing(sb)
    mock_err.assert_called_once()
