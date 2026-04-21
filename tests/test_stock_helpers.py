"""재고·상품 조회 헬퍼 — Mock Supabase."""

from __future__ import annotations

from unittest.mock import MagicMock

from lib.stock import bump_stock, find_product


def _chain_with_execute(data):
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.limit.return_value = m
    m.execute.return_value = MagicMock(data=data)
    return m


def test_find_product_empty_query() -> None:
    sb = MagicMock()
    assert find_product(sb, "  ") is None
    assert find_product(sb, "") is None
    sb.table.assert_not_called()


def test_find_product_by_product_code() -> None:
    sb = MagicMock()
    row = {"id": "u1", "product_code": "ABC", "barcode": None}
    sb.table.return_value = _chain_with_execute([row])
    assert find_product(sb, "ABC") == row
    sb.table.assert_called_once_with("fo_products")


def test_find_product_falls_back_to_barcode() -> None:
    sb = MagicMock()
    row = {"id": "u1", "product_code": "ABC", "barcode": "8801234567890"}
    c1 = _chain_with_execute([])
    c2 = _chain_with_execute([row])
    sb.table.side_effect = [c1, c2]
    assert find_product(sb, "8801234567890") == row
    assert sb.table.call_count == 2


def test_bump_stock_insert_when_missing() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.upsert.return_value = chain
    chain.execute.side_effect = [
        MagicMock(data=[]),
        MagicMock(),
    ]

    q = bump_stock(sb, "store-1", "prod-1", 3.0)
    assert q == 3.0
    chain.upsert.assert_called_once()
    args, kwargs = chain.upsert.call_args
    assert args[0] == {"store_id": "store-1", "product_id": "prod-1", "quantity": 3.0}


def test_bump_stock_adds_to_existing() -> None:
    sb = MagicMock()
    chain = MagicMock()
    sb.table.return_value = chain
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.upsert.return_value = chain
    chain.execute.side_effect = [
        MagicMock(data=[{"quantity": 10.0}]),
        MagicMock(data=[]),
    ]

    assert bump_stock(sb, "s", "p", -2.5) == 7.5
    chain.upsert.assert_called_once()
    assert chain.upsert.call_args[0][0]["quantity"] == 7.5
