"""통계 — 매출·영업이익·카테고리·매입처 분석."""

from __future__ import annotations

import sys
from datetime import timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="통계·리포트 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.analytics_data import load_sales_analytics
from lib.constants import get_data_entry_start_date, today_kst
from lib.report_export import df_to_csv_bytes, df_to_xlsx_bytes, tables_to_pdf_bytes
from lib.store_defaults import default_stats_store_label_index
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt
from lib.supabase_client import get_supabase

st.title("통계")
try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("지점을 먼저 등록하세요.")
    st.stop()

store_map = {str(s["id"]): f"{s['store_code']} — {s['name']}" for s in stores}
store_labels = ["전체"] + [store_map[str(s["id"])] for s in stores]

with st.container():
    st.markdown("##### 조회 조건")
    f1, f2, f3 = st.columns([2, 1, 1])
    with f1:
        pick = st.selectbox(
            "지점",
            store_labels,
            index=default_stats_store_label_index(store_labels),
            help="기본값: 북촌점(BKC01)이 있으면 해당 지점. 전체 매장 합계는 「전체」.",
        )
    with f2:
        d0 = st.date_input(
            "시작일",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
        )
    with f3:
        d1 = st.date_input(
            "종료일",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
        )

if pick == "전체":
    store_ids = [str(s["id"]) for s in stores]
else:
    sid = [str(s["id"]) for s in stores if store_map[str(s["id"])] == pick][0]
    store_ids = [sid]

if d0 > d1:
    st.error("시작일이 종료일보다 늦습니다.")
    st.stop()

with st.spinner("데이터 불러오는 중…"):
    df_s, df_m = load_sales_analytics(sb, store_ids, d0, d1)

if df_s.empty:
    st.info("선택한 기간·지점에 POS 판매 데이터가 없습니다.")

df_s = df_s.copy()
for _col in ("store_id", "payment", "cash_amount", "card_amount", "seller_code", "sold_at"):
    if _col not in df_s.columns:
        df_s[_col] = pd.Series(dtype="object")
df_s["store_name"] = df_s["store_id"].astype(str).map(store_map)
df_s["seller_label"] = df_s["seller_code"].fillna("미지정")

total_pay = int(df_s["payment"].sum())
total_cogs = int(df_m["cogs"].sum()) if not df_m.empty else 0
profit = total_pay - total_cogs

# ── 버튼 기반 통계 항목 ────────────────────────────────────────
if "fo_stats_view" not in st.session_state:
    st.session_state["fo_stats_view"] = "sales_product"

v1, v2, v3, v4 = st.columns(4)
with v1:
    if st.button("판매상품 검색", use_container_width=True):
        st.session_state["fo_stats_view"] = "sales_product"
with v2:
    if st.button("매출 검색", use_container_width=True):
        st.session_state["fo_stats_view"] = "sales_amount"
with v3:
    if st.button("지출 내역", use_container_width=True):
        st.session_state["fo_stats_view"] = "expense"
with v4:
    if st.button("판매사 실적", use_container_width=True):
        st.session_state["fo_stats_view"] = "seller_perf"

view = st.session_state["fo_stats_view"]

if view == "sales_product":
    st.subheader("판매상품 검색")
    if df_m.empty:
        st.info("라인 매출 데이터가 없습니다.")
    else:
        # 브랜드 버튼 생성
        brands = sb.table("fo_brands").select("id,name").order("name").execute().data or []
        brand_map = {str(b["id"]): str(b.get("name") or "") for b in brands}
        if "brand_id" in df_m.columns:
            brand_ids = sorted({str(x) for x in df_m["brand_id"].dropna().astype(str).tolist() if x in brand_map})
        else:
            brand_ids = []
        if "fo_stats_brand_pick" not in st.session_state:
            st.session_state["fo_stats_brand_pick"] = ""

        bcols = st.columns(6)
        with bcols[0]:
            if st.button("전체 브랜드", key="fo_stats_brand_all", use_container_width=True):
                st.session_state["fo_stats_brand_pick"] = ""
        for i, bid in enumerate(brand_ids):
            with bcols[(i + 1) % 6]:
                if st.button(brand_map.get(bid, bid), key=f"fo_stats_brand_{bid}", use_container_width=True):
                    st.session_state["fo_stats_brand_pick"] = bid

        pick_brand = st.session_state.get("fo_stats_brand_pick", "")
        lines = df_m.copy()
        if pick_brand and "brand_id" in lines.columns:
            lines = lines[lines["brand_id"].astype(str) == pick_brand]

        if lines.empty:
            st.info("선택한 브랜드의 판매 데이터가 없습니다.")
        else:
            out = (
                lines.groupby(["display_name", "product_code"], as_index=False)
                .agg(판매량=("quantity", "sum"))
                .sort_values("판매량", ascending=False)
            )
            st.dataframe(out, hide_index=True, use_container_width=True)

elif view == "sales_amount":
    st.subheader("매출 검색")
    if df_s.empty:
        sales_count = 0
        cash_total = 0
        card_total = 0
    else:
        sales_count = int(len(df_s))
        cash_total = int(df_s["cash_amount"].sum())
        card_total = int(df_s["card_amount"].sum())
    sale_total = cash_total + card_total
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("합계", f"{sale_total:,}")
    c2.metric("현금", f"{cash_total:,}")
    c3.metric("카드", f"{card_total:,}")
    c4.metric("건수", f"{sales_count:,}")

elif view == "expense":
    st.subheader("지출 내역")
    settles = (
        sb.table("fo_settlements")
        .select("id,business_date")
        .in_("store_id", store_ids)
        .gte("business_date", d0.isoformat())
        .lte("business_date", d1.isoformat())
        .order("business_date")
        .execute()
        .data
        or []
    )
    if not settles:
        st.info("기간 내 정산 지출 데이터가 없습니다.")
    else:
        sid_to_day = {str(s["id"]): str(s["business_date"]) for s in settles}
        sids = list(sid_to_day.keys())
        ex_rows = []
        for i in range(0, len(sids), 100):
            chunk = sids[i : i + 100]
            ex_rows.extend(
                sb.table("fo_settlement_expenses")
                .select("settlement_id,memo,amount")
                .in_("settlement_id", chunk)
                .order("sort_order")
                .execute()
                .data
                or []
            )
        if not ex_rows:
            st.info("지출 데이터가 없습니다.")
        else:
            out = []
            total = 0
            for r in ex_rows:
                qty = 1
                unit = int(r.get("amount") or 0)
                subtotal = qty * unit
                total += subtotal
                out.append(
                    {
                        "일자": sid_to_day.get(str(r["settlement_id"]), ""),
                        "항목": r.get("memo") or "-",
                        "수량": qty,
                        "단가": unit,
                        "합계": subtotal,
                    }
                )
            st.dataframe(pd.DataFrame(out), hide_index=True, use_container_width=True)
            st.metric("총계", f"{total:,}")

elif view == "seller_perf":
    st.subheader("판매사 실적")
    if df_m.empty:
        st.info("라인 매출 데이터가 없습니다.")
    else:
        perf = df_m.copy()
        if "seller_code" not in perf.columns:
            perf["seller_code"] = None
        perf["판매사"] = perf["seller_code"].fillna("미지정")
        perf["지점"] = perf["store_id"].astype(str).map(store_map).fillna("-")
        perf["일자"] = pd.to_datetime(perf["sold_at"], utc=True).dt.tz_convert("Asia/Seoul").dt.date.astype(str)
        perf["합계"] = perf["alloc_revenue"].astype(float)
        perf["수량"] = perf["quantity"].astype(float)
        perf["단가"] = perf.apply(lambda r: 0 if float(r["수량"] or 0) == 0 else float(r["합계"]) / float(r["수량"]), axis=1)

        grp = (
            perf.groupby(["지점", "판매사", "일자", "product_code"], as_index=False)
            .agg(수량=("수량", "sum"), 합계=("합계", "sum"))
            .rename(columns={"product_code": "상품코드"})
        )
        grp["단가"] = grp.apply(lambda r: 0 if float(r["수량"] or 0) == 0 else float(r["합계"]) / float(r["수량"]), axis=1)
        grp = grp.sort_values(["판매사", "일자", "상품코드"])
        grp["누계"] = grp.groupby("판매사")["합계"].cumsum()
        grp["누적수량"] = grp.groupby("판매사")["수량"].cumsum()
        grp["총계"] = grp.groupby("판매사")["합계"].transform("sum")
        st.dataframe(
            grp[["지점", "판매사", "일자", "상품코드", "수량", "단가", "합계", "누계", "총계", "누적수량"]],
            hide_index=True,
            use_container_width=True,
        )
