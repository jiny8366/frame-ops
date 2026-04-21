"""fo_stock 증감 — POS·입고·출고·조정에서 공통 사용."""

from __future__ import annotations

from typing import Any


def find_product(sb: Any, code_or_barcode: str) -> dict | None:
    q = (code_or_barcode or "").strip()
    if not q:
        return None
    r = sb.table("fo_products").select("*").eq("product_code", q).limit(1).execute().data
    if r:
        return r[0]
    r = sb.table("fo_products").select("*").eq("barcode", q).limit(1).execute().data
    if r:
        return r[0]
    return None


def bump_stock(sb: Any, store_id: str, product_id: str, delta: float) -> float:
    """재고를 delta만큼 변경하고 새 수량을 반환."""
    cur = (
        sb.table("fo_stock")
        .select("quantity")
        .eq("store_id", store_id)
        .eq("product_id", product_id)
        .limit(1)
        .execute()
        .data
    )
    prev = float(cur[0]["quantity"]) if cur else 0.0
    new_q = prev + float(delta)
    sb.table("fo_stock").upsert(
        {"store_id": store_id, "product_id": product_id, "quantity": new_q},
        on_conflict="store_id,product_id",
    ).execute()
    return new_q
