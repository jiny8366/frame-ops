"""purchase_orders — 라인 상태 규칙·집계 (DB 없음)."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from lib.purchase_orders import aggregate_sold_quantities_by_product, purchase_line_in_processing_queue


def test_purchase_line_in_processing_queue() -> None:
    assert purchase_line_in_processing_queue("pending") is True
    assert purchase_line_in_processing_queue("received") is False
    assert purchase_line_in_processing_queue("deferred") is False


def test_aggregate_sold_empty_sales() -> None:
    """판매 0건이면 빈 리스트."""

    class _Q:
        def __init__(self, data):
            self._data = data

        def eq(self, *a, **k):
            return self

        def gte(self, *a, **k):
            return self

        def lt(self, *a, **k):
            return self

        def in_(self, *a, **k):
            return self

        def select(self, *a, **k):
            return self

        def execute(self):
            m = MagicMock()
            m.data = self._data
            return m

    class SB:
        def table(self, name):
            if name == "fo_sales":
                return _Q([])
            raise AssertionError(name)

    out = aggregate_sold_quantities_by_product(SB(), "store-uuid", date(2026, 4, 1), date(2026, 4, 1))
    assert out == []
