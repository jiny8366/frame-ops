"""판매 검색 UI — 전용 페이지 또는 POS 다이얼로그에서 재사용."""

from __future__ import annotations

import pandas as pd
import streamlit as st
from supabase import Client

from lib.constants import get_data_entry_start_date, today_kst
from lib.sales_search import search_sales_lines_by_product_code_and_day
from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt


def render_sales_search_panel(
    sb: Client,
    *,
    fixed_store_id: str | None = None,
    fixed_store_label: str | None = None,
    key_prefix: str = "fo_sale_search",
) -> None:
    """
    fixed_store_id 가 있으면 지점 고정(지점 POS 등). 없으면 전체/지점 선택(판매 검색 페이지).
    """
    run_key = f"{key_prefix}_run"

    if fixed_store_id:
        store_filter: str | None = str(fixed_store_id)
        if fixed_store_label:
            st.caption(f"검색 지점: **{fixed_store_label}**")
    else:
        stores = [s for s in load_stores_with_business_fields_or_halt(sb) if s.get("active", True)]
        store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
        scope_labels = ["전체 지점 (느릴 수 있음)"] + store_labels
        store_filter = None

    c1, c2, c3 = st.columns(3)
    with c1:
        search_day = st.date_input(
            "판매일 (KST)",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key=f"{key_prefix}_day",
        )
    with c2:
        code_q = st.text_input("상품코드 (부분 검색)", key=f"{key_prefix}_code")
    with c3:
        if not fixed_store_id:
            si = st.selectbox(
                "지점 범위",
                range(len(scope_labels)),
                format_func=lambda i: scope_labels[i],
                key=f"{key_prefix}_store",
            )
            if si > 0 and stores:
                store_filter = str(stores[si - 1]["id"])

    if st.button("검색", type="primary", key=f"{key_prefix}_btn"):
        st.session_state[run_key] = True

    if st.session_state.get(run_key) and (code_q or "").strip():
        rows = search_sales_lines_by_product_code_and_day(
            sb,
            day=search_day,
            product_code_contains=code_q,
            store_id=store_filter,
        )
        if not rows:
            st.info("조건에 맞는 판매가 없습니다. 날짜·지점·상품코드를 확인하세요.")
        else:
            st.success(f"{len(rows)}건")
            show = pd.DataFrame(rows)
            drop_cols = [c for c in ("sale_id",) if c in show.columns]
            if drop_cols:
                show = show.drop(columns=drop_cols)
            st.dataframe(show, use_container_width=True, hide_index=True)
    elif st.session_state.get(run_key):
        st.warning("상품코드를 입력하세요.")
