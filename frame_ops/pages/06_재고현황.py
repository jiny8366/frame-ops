"""재고 현황 · 적정재고 설정"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="재고 현황 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.schema_guard import stop_if_inventory_migration_missing
from lib.stock import find_product
from lib.store_defaults import default_store_index, preferred_product_category
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt
from lib.supabase_client import get_supabase

st.title("재고 현황 · 적정재고")
st.caption("음수 재고는 붉게 표시합니다. 적정재고는 발주·부족 알림에 사용합니다.")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_inventory_migration_missing(sb)

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

with st.container():
    st.markdown("##### 조회 지점")
    store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
    sp = st.selectbox("지점", store_labels, index=default_store_index(stores))
    store_id = stores[store_labels.index(sp)]["id"]

with st.expander("적정재고 등록 (발주·부족 기준)", expanded=False):
    with st.form("set_target"):
        code = st.text_input("상품코드/바코드")
        opt = st.number_input("적정재고 수량", min_value=0.0, value=1.0, step=1.0)
        if st.form_submit_button("저장"):
            p = find_product(sb, code)
            if not p:
                st.error("상품을 찾을 수 없습니다.")
            else:
                try:
                    sb.table("fo_stock_targets").upsert(
                        {
                            "store_id": store_id,
                            "product_id": p["id"],
                            "optimal_quantity": float(opt),
                        },
                        on_conflict="store_id,product_id",
                    ).execute()
                    st.success("저장되었습니다.")
                    st.rerun()
                except Exception as ex:
                    st.error(f"저장 실패: {ex}")

stocks = sb.table("fo_stock").select("product_id, quantity").eq("store_id", store_id).execute().data or []
targets = sb.table("fo_stock_targets").select("product_id, optimal_quantity").eq("store_id", store_id).execute().data or []

qty_by_pid: dict[str, float] = {str(s["product_id"]): float(s["quantity"]) for s in stocks}
opt_by_pid: dict[str, float] = {str(t["product_id"]): float(t["optimal_quantity"]) for t in targets}
all_pids = sorted(set(qty_by_pid) | set(opt_by_pid), key=str)

if not all_pids:
    st.info("이 지점에 재고·적정재고 데이터가 없습니다. 입고 또는 위에서 적정재고를 등록하세요.")
    st.page_link("pages/03_입고.py", label="→ 입고")
    st.page_link("pages/01_상품등록.py", label="→ 상품 등록")
    st.stop()

# 상품 메타 (배치)
products: dict[str, dict] = {}
chunk = 200
for i in range(0, len(all_pids), chunk):
    part = all_pids[i : i + chunk]
    for row in sb.table("fo_products").select("id, product_code, display_name, category").in_("id", part).execute().data or []:
        products[str(row["id"])] = row

rows_out = []
for pid in all_pids:
    pr = products.get(pid, {})
    qv = qty_by_pid.get(pid, 0.0)
    ov = opt_by_pid.get(pid)
    short = (ov is not None and ov > 0 and qv < ov)
    rows_out.append(
        {
            "상품코드": pr.get("product_code", pid[:8]),
            "상품명": pr.get("display_name", ""),
            "카테고리": pr.get("category", ""),
            "현재고": qv,
            "적정재고": ov if ov is not None else None,
            "부족": "예" if short else "",
            "음수": "예" if qv < 0 else "",
        }
    )

st.subheader("목록")
_pc = preferred_product_category()
qb1, qb2, qb3 = st.columns([1, 1, 4])
with qb1:
    if st.button("No Public만", help=f"카테고리 「{_pc}」로 필터"):
        st.session_state.fo_stock_filter = _pc
        st.rerun()
with qb2:
    if st.button("필터 지우기"):
        st.session_state.fo_stock_filter = ""
        st.rerun()
flt = st.text_input(
    "상품코드·명·카테고리 필터",
    key="fo_stock_filter",
    placeholder=f"일부 문자만 입력 (예: {_pc})",
)
q = (flt or "").strip().lower()
if q:
    rows_view = [
        r
        for r in rows_out
        if q in str(r.get("상품코드") or "").lower()
        or q in str(r.get("상품명") or "").lower()
        or q in str(r.get("카테고리") or "").lower()
    ]
else:
    rows_view = rows_out
st.caption(f"표시 **{len(rows_view)}**건 / 전체 {len(rows_out)}건")

short_in_view = [r for r in rows_view if r.get("부족") == "예"]
if short_in_view:
    st.warning(f"적정 대비 부족 **{len(short_in_view)}**건 — 발주 후보는 주문 리스트에서 CSV로 받을 수 있습니다.")
    st.page_link("pages/07_주문리스트.py", label="→ 주문(발주) 리스트")

neg_df = [r for r in rows_view if r["음수"] == "예"]
if neg_df:
    st.error(f"음수 재고 {len(neg_df)}건 — 확인이 필요합니다.")
    st.dataframe(neg_df, hide_index=True, use_container_width=True)

st.dataframe(rows_view, hide_index=True, use_container_width=True, height=480)
