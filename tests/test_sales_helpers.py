"""매출 헬퍼 — Mock Supabase."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from lib.sales_helpers import store_cash_sales_total


def test_store_cash_sales_total_sums_cash() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.gte.return_value = chain
    chain.lt.return_value = chain
    chain.execute.return_value = MagicMock(
        data=[
            {"cash_amount": 10000},
            {"cash_amount": None},
            {"cash_amount": 5000},
        ]
    )

    total = store_cash_sales_total(sb, "store-a", date(2026, 4, 15))
    assert total == 15000
    chain.gte.assert_called_once()
    chain.lt.assert_called_once()
    args_gte = chain.gte.call_args[0]
    assert "sold_at" == args_gte[0]


def test_store_cash_sales_total_empty() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.gte.return_value = chain
    chain.lt.return_value = chain
    chain.execute.return_value = MagicMock(data=None)

    assert store_cash_sales_total(sb, "s", date(2026, 1, 1)) == 0
