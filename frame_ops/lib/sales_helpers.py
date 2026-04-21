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


def format_pos_keypad_amount_display(raw: str) -> str:
    """POS 금액 키패드 표시창: 숫자만 남겨 천 단위 콤마(정수 원)."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if not digits:
        return "0"
    return f"{int(digits):,}"


def format_fo_quantity_display(q: Any) -> str:
    """수량 표시용: 소수점 이하는 표시하지 않고 정수만 노출."""
    try:
        return str(int(float(q)))
    except (TypeError, ValueError):
        return "0"
