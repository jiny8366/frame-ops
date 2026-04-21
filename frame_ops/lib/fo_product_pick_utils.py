"""브랜드·제품번호·칼라 선택 — POS·상품등록 등에서 공통 사용."""

from __future__ import annotations

from typing import Any

from supabase import Client


def brand_page_size(n: int) -> int:
    if n <= 4:
        return 4
    if n <= 9:
        return 9
    return 12


def brand_grid_cols(page_size: int) -> int:
    return 2 if page_size == 4 else 3 if page_size == 9 else 4


def load_all_brands(sb: Client) -> list[dict[str, Any]]:
    return sb.table("fo_brands").select("id, name").order("name").execute().data or []


def load_distinct_style_codes(sb: Client, brand_id: str) -> list[str]:
    rows = (
        sb.table("fo_products")
        .select("style_code")
        .eq("brand_id", brand_id)
        .execute()
        .data
        or []
    )
    return sorted(
        {
            str(r["style_code"])
            for r in rows
            if r.get("style_code") is not None and str(r.get("style_code") or "").strip() != ""
        }
    )


def load_distinct_color_codes(sb: Client, brand_id: str, style_code_val: str) -> list[str]:
    stc = (style_code_val or "").strip()
    if not stc:
        return []
    rows = (
        sb.table("fo_products")
        .select("color_code")
        .eq("brand_id", brand_id)
        .eq("style_code", stc)
        .execute()
        .data
        or []
    )
    return sorted(
        {
            str(r["color_code"])
            for r in rows
            if r.get("color_code") is not None and str(r.get("color_code") or "").strip() != ""
        }
    )
