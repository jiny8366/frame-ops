"""브랜드·제품번호·칼라 선택 — POS·상품등록 등에서 공통 사용."""

from __future__ import annotations

from typing import Any

import streamlit as st
from supabase import Client


def brand_page_size(n: int) -> int:
    if n <= 4:
        return 4
    if n <= 9:
        return 9
    return 12


def brand_grid_cols(page_size: int) -> int:
    return 2 if page_size == 4 else 3 if page_size == 9 else 4


def _ensure_nopublic_brand_mapping(sb: Client) -> None:
    """
    배포 DB에서 브랜드 마스터가 비어도 POS 브랜드 선택이 동작하도록 자동 복구.
    - fo_brands에 'No Public' 생성
    - category='No Public' 이면서 brand_id 없는 상품에 brand/style/color 채움
    """
    probe = (
        sb.table("fo_products")
        .select("product_code")
        .eq("category", "No Public")
        .is_("brand_id", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not probe:
        return

    bh = sb.table("fo_brands").select("id").eq("name", "No Public").limit(1).execute().data or []
    if bh:
        bid = str(bh[0]["id"])
    else:
        sb.table("fo_brands").insert({"name": "No Public"}).execute()
        bh2 = sb.table("fo_brands").select("id").eq("name", "No Public").limit(1).execute().data or []
        if not bh2:
            return
        bid = str(bh2[0]["id"])

    rows = (
        sb.table("fo_products")
        .select("product_code")
        .eq("category", "No Public")
        .is_("brand_id", "null")
        .execute()
        .data
        or []
    )
    for r in rows:
        pc = str(r.get("product_code") or "").strip()
        if not pc:
            continue
        if "-" in pc:
            style_code, color_code = [x.strip() for x in pc.rsplit("-", 1)]
        else:
            style_code, color_code = pc, ""
        sb.table("fo_products").update(
            {"brand_id": bid, "style_code": style_code, "color_code": color_code}
        ).eq("product_code", pc).execute()


@st.cache_data(ttl=300, show_spinner=False)
def _cached_brands(supabase_url: str) -> list[dict[str, Any]]:
    from lib.supabase_client import get_supabase
    sb = get_supabase()
    brands = sb.table("fo_brands").select("id, name").order("name").execute().data or []
    if brands:
        return brands
    try:
        _ensure_nopublic_brand_mapping(sb)
    except Exception:
        return []
    return sb.table("fo_brands").select("id, name").order("name").execute().data or []


def load_all_brands(sb: Client) -> list[dict[str, Any]]:
    from lib.supabase_client import get_configured_supabase_url
    return _cached_brands(get_configured_supabase_url())


@st.cache_data(ttl=300, show_spinner=False)
def _cached_style_codes(supabase_url: str, brand_id: str) -> list[str]:
    # DB 뷰 fo_product_styles_by_brand에서 DISTINCT 된 style_code만 가져온다.
    # 브랜드의 전체 상품 행을 풀로드하지 않으므로 네트워크 전송량·파싱이 급감.
    # 선행 조건: supabase/migrations/20260423_frame_ops_product_picker_views.sql 적용.
    from lib.supabase_client import get_supabase
    sb = get_supabase()
    rows = (
        sb.table("fo_product_styles_by_brand")
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


def load_distinct_style_codes(sb: Client, brand_id: str) -> list[str]:
    from lib.supabase_client import get_configured_supabase_url
    return _cached_style_codes(get_configured_supabase_url(), brand_id)


@st.cache_data(ttl=300, show_spinner=False)
def _cached_color_codes(supabase_url: str, brand_id: str, style_code_val: str) -> list[str]:
    # DB 뷰 fo_product_colors_by_style에서 DISTINCT 된 color_code만 가져온다.
    # 같은 (brand_id, style_code)로 묶인 전체 상품 행을 풀로드하지 않는다.
    # 선행 조건: supabase/migrations/20260423_frame_ops_product_picker_views.sql 적용.
    from lib.supabase_client import get_supabase
    sb = get_supabase()
    stc = (style_code_val or "").strip()
    if not stc:
        return []
    rows = (
        sb.table("fo_product_colors_by_style")
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


def load_distinct_color_codes(sb: Client, brand_id: str, style_code_val: str) -> list[str]:
    from lib.supabase_client import get_configured_supabase_url
    return _cached_color_codes(get_configured_supabase_url(), brand_id, style_code_val)
