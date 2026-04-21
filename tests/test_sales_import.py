"""sales_import — CSV 파싱·결제 검증 (DB 없음)."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest

from lib.sales_import import (
    iter_sale_drafts_from_rows,
    parse_sales_import_csv,
    parse_sold_at,
    payment_check_message,
    validate_sale_drafts,
)


def test_parse_sold_at_naive_is_seoul() -> None:
    dt = parse_sold_at("2026-04-10 14:30:00")
    assert dt.tzinfo == ZoneInfo("Asia/Seoul")


def test_parse_sold_at_zulu() -> None:
    dt = parse_sold_at("2026-04-10T05:30:00Z")
    assert dt.astimezone(ZoneInfo("Asia/Seoul")).hour == 14


def test_parse_single_receipt_csv() -> None:
    csv = """receipt_key,store_code,sold_at,product_code,quantity,unit_price,cash_amount,card_amount,discount_total
R1,BKC01,2026-04-10T12:00:00+09:00,01:01-C01,1,50000,50000,0,0
"""
    drafts = parse_sales_import_csv(csv)
    assert len(drafts) == 1
    assert drafts[0].receipt_key == "R1"
    assert drafts[0].cash_amount == 50000
    assert len(drafts[0].lines) == 1
    assert drafts[0].lines[0].product_code == "01:01-C01"


def test_parse_multiline_receipt() -> None:
    csv = """receipt_key,store_code,sold_at,product_code,quantity,unit_price,cash_amount,card_amount,discount_total
G1,BKC01,2026-04-10T12:00:00+09:00,A,1,30000,50000,0,10000
G1,BKC01,2026-04-10T12:00:00+09:00,B,1,30000,,,
"""
    drafts = parse_sales_import_csv(csv)
    assert len(drafts) == 1
    assert len(drafts[0].lines) == 2
    assert payment_check_message(drafts[0]) is None


def test_payment_mismatch() -> None:
    from lib.sales_import import SaleDraft, SaleLineDraft

    sale = SaleDraft(
        receipt_key="x",
        store_code="BKC01",
        sold_at=datetime.now(ZoneInfo("Asia/Seoul")),
        lines=[
            SaleLineDraft("A", "", 1, 10000, 0, None),
        ],
        cash_amount=5000,
        card_amount=0,
        discount_total=0,
    )
    assert payment_check_message(sale) is not None


def test_validate_with_mock_sb(monkeypatch: pytest.MonkeyPatch) -> None:
    csv = """receipt_key,store_code,sold_at,product_code,quantity,unit_price,cash_amount,card_amount,discount_total
V1,BKC01,2026-04-10T12:00:00+09:00,XCODE,2,10000,20000,0,0
"""

    def fake_find(sb, code: str):
        if code == "XCODE":
            return {"id": "pid", "product_code": "XCODE", "cost_price": 7000}
        return None

    monkeypatch.setattr("lib.sales_import.find_product", fake_find)
    monkeypatch.setattr("lib.sales_import.is_business_day_settled", lambda *a, **k: False)

    sb = MagicMock()

    def _chain(data):
        ex = MagicMock()
        ex.data = data
        ch = MagicMock()
        ch.execute.return_value = ex
        ch.limit.return_value = ch
        ch.eq.return_value = ch
        ch.select.return_value = ch
        return ch

    store_chain = _chain([{"id": "sid", "store_code": "BKC01"}])
    empty_idem = _chain([])

    def table(name: str):
        if name == "fo_stores":
            return store_chain
        if name == "fo_sales":
            return empty_idem
        return _chain([])

    sb.table.side_effect = table

    drafts = parse_sales_import_csv(csv)
    err, warn = validate_sale_drafts(sb, drafts)
    assert err == []
    assert warn == []


def test_rejects_non_positive_quantity() -> None:
    csv = """receipt_key,store_code,sold_at,product_code,quantity,unit_price,cash_amount,card_amount,discount_total
R1,BKC01,2026-04-10T12:00:00+09:00,P,0,1000,0,0,0
"""
    with pytest.raises(ValueError, match="quantity"):
        parse_sales_import_csv(csv)


def test_iter_rejects_store_mismatch() -> None:
    rows = [
        {
            "receipt_key": "Z",
            "store_code": "A",
            "sold_at": "2026-04-10T12:00:00+09:00",
            "product_code": "P",
            "quantity": "1",
            "unit_price": "1",
            "cash_amount": "1",
            "card_amount": "0",
            "discount_total": "0",
        },
        {
            "receipt_key": "Z",
            "store_code": "B",
            "sold_at": "2026-04-10T12:00:00+09:00",
            "product_code": "P",
            "quantity": "1",
            "unit_price": "1",
            "cash_amount": "",
            "card_amount": "",
            "discount_total": "",
        },
    ]
    with pytest.raises(ValueError, match="store_code"):
        iter_sale_drafts_from_rows(rows)
