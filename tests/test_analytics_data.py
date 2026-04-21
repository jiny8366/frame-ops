"""analytics_data — 기간 경계·load_sales_analytics (Mock)."""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock

import lib.analytics_data as ad
from lib.analytics_data import load_sales_analytics
from lib.constants import kst_day_range_utc_iso


def test_period_utc_bounds_matches_kst_day_edges() -> None:
    d0 = date(2026, 4, 1)
    d1 = date(2026, 4, 3)
    lo, hi = ad._period_utc_bounds(d0, d1)
    lo_d0, _ = kst_day_range_utc_iso(d0)
    _, hi_end = kst_day_range_utc_iso(d1 + timedelta(days=1))
    assert lo == lo_d0
    assert hi == hi_end


def test_load_sales_analytics_empty() -> None:
    sb = MagicMock()
    q = MagicMock()
    sb.table.return_value = q
    q.select.return_value = q
    q.gte.return_value = q
    q.lt.return_value = q
    q.in_.return_value = q
    q.execute.return_value = MagicMock(data=[])

    df_s, df_m = load_sales_analytics(sb, ["store-1"], date(2026, 4, 10), date(2026, 4, 10))
    assert df_s.empty and df_m.empty


def test_load_sales_analytics_alloc_revenue_splits_payment() -> None:
    sale_row = {
        "id": "sale1",
        "store_id": "st1",
        "sold_at": "2026-04-15T03:00:00+00:00",
        "cash_amount": 1000,
        "card_amount": 0,
        "seller_code": None,
    }
    line_rows = [
        {
            "sale_id": "sale1",
            "product_id": "p1",
            "quantity": 1,
            "unit_price": 500,
            "line_discount": 0,
            "cost_price_at_sale": 100,
        },
        {
            "sale_id": "sale1",
            "product_id": "p2",
            "quantity": 1,
            "unit_price": 500,
            "line_discount": 0,
            "cost_price_at_sale": 200,
        },
    ]
    prod_rows = [
        {"id": "p1", "display_name": "A", "category": "c1", "supplier_id": None},
        {"id": "p2", "display_name": "B", "category": "c2", "supplier_id": None},
    ]

    def make_q(data):
        m = MagicMock()
        m.select.return_value = m
        m.gte.return_value = m
        m.lt.return_value = m
        m.in_.return_value = m
        m.execute.return_value = MagicMock(data=data)
        return m

    def table_side(name: str):
        if name == "fo_sales":
            return make_q([sale_row])
        if name == "fo_sale_lines":
            return make_q(line_rows)
        if name == "fo_products":
            return make_q(prod_rows)
        raise AssertionError(f"unexpected table {name}")

    sb = MagicMock()
    sb.table.side_effect = table_side

    df_s, df_m = load_sales_analytics(sb, ["st1"], date(2026, 4, 15), date(2026, 4, 15))
    assert not df_s.empty
    assert len(df_m) == 2
    assert int(df_m["alloc_revenue"].sum()) == 1000
    assert df_m["weekday_kr"].iloc[0] in ad._WEEK_KR
