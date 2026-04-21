"""판매 집계 → 발주서(주문서) · 매입/보류 라인 상태."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from lib.constants import kst_day_range_utc_iso


def _chunks(xs: list, n: int):
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def aggregate_sold_quantities_by_product(
    sb: Any, store_id: str, d0: date, d1: date
) -> list[dict[str, Any]]:
    """기간·지점 판매 라인 수량을 상품별로 합산."""
    lo, _ = kst_day_range_utc_iso(d0)
    _, hi = kst_day_range_utc_iso(d1 + timedelta(days=1))
    sales = (
        sb.table("fo_sales")
        .select("id")
        .eq("store_id", store_id)
        .gte("sold_at", lo)
        .lt("sold_at", hi)
        .execute()
        .data
        or []
    )
    if not sales:
        return []
    sale_ids = [str(s["id"]) for s in sales]
    qty_by_pid: dict[str, float] = defaultdict(float)
    for ch in _chunks(sale_ids, 80):
        lines = (
            sb.table("fo_sale_lines")
            .select("product_id, quantity")
            .in_("sale_id", ch)
            .execute()
            .data
            or []
        )
        for ln in lines:
            pid = str(ln["product_id"])
            qty_by_pid[pid] += float(ln["quantity"] or 0)
    out = [{"product_id": pid, "quantity": q} for pid, q in sorted(qty_by_pid.items()) if q > 0]
    return out


def purchase_line_in_processing_queue(status: str) -> bool:
    """매입처리 화면에 노출할 라인인지 (pending 만)."""
    return status == "pending"
