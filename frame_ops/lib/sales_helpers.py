"""매출 집계 헬퍼."""

from __future__ import annotations

from datetime import date
from typing import Any

from lib.constants import kst_day_range_utc_iso


def store_cash_sales_total(sb: Any, store_id: str, business_day: date) -> int:
    """해당 지점·한국 영업일의 POS 현금 매출(fo_sales.cash_amount) 합계."""
    start_utc, end_utc = kst_day_range_utc_iso(business_day)
    rows = (
        sb.table("fo_sales")
        .select("cash_amount")
        .eq("store_id", store_id)
        .gte("sold_at", start_utc)
        .lt("sold_at", end_utc)
        .execute()
        .data
        or []
    )
    return sum(int(r.get("cash_amount") or 0) for r in rows)
