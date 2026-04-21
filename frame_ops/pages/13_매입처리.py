"""매입처리 — 저장된 주문서 라인별 매입완료·보류"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="매입처리 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.report_export import order_sheet_pdf_bytes  # noqa: E402
from lib.schema_guard import stop_if_purchase_orders_migration_missing  # noqa: E402
from lib.store_defaults import (  # noqa: E402
    default_store_index,
    fetch_store_for_order_header,
)
from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("매입처리")
st.caption(
    "주문 리스트에서 저장한 **주문서**를 불러옵니다. "
    "**매입완료**에 체크하면 해당 품목은 매입 처리된 것으로 닫히고, "
    "체크하지 않은 품목은 **다음에도 같은 주문서에 남습니다**. "
    "**보류**에 체크하면 이후 매입 목록에 **나타나지 않습니다**."
)
st.page_link("pages/07_주문리스트.py", label="→ 주문 리스트")
st.page_link("pages/03_입고.py", label="→ 입고 (실제 입고 전표)")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_purchase_orders_migration_missing(sb)

stores = [s for s in load_stores_with_business_fields_or_halt(sb) if s.get("active", True)]
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
sp = st.selectbox("지점", store_labels, index=default_store_index(stores), key="fo_pur_store")
_si = store_labels.index(sp)
store_id = str(stores[_si]["id"])
store_code = stores[_si]["store_code"]

sheets = (
    sb.table("fo_purchase_order_sheets")
    .select("id, title, period_start, period_end, created_at, note")
    .eq("store_id", store_id)
    .order("created_at", desc=True)
    .limit(80)
    .execute()
    .data
    or []
)

if not sheets:
    st.info("저장된 주문서가 없습니다. **주문 리스트 → 판매 기반 주문서**에서 먼저 저장하세요.")
    st.stop()

sheet_choices: list[tuple[str, str, int]] = []
for sh in sheets:
    lid = str(sh["id"])
    lines = (
        sb.table("fo_purchase_order_lines")
        .select("line_status")
        .eq("sheet_id", lid)
        .execute()
        .data
        or []
    )
    n_pending = sum(1 for x in lines if x.get("line_status") == "pending")
    if n_pending > 0:
        label = f"{sh.get('title', '')} · 미처리 {n_pending}건 · {sh.get('period_start')}~{sh.get('period_end')}"
        sheet_choices.append((label, lid, n_pending))

if not sheet_choices:
    st.success("처리할 **미매입(pending)** 라인이 있는 주문서가 없습니다. (보류·매입완료만 남은 경우)")
    st.stop()

labels = [x[0] for x in sheet_choices]
pick = st.selectbox("주문서 선택 (미처리 건이 있는 것만)", labels, key="fo_pur_pick")
sheet_id = sheet_choices[labels.index(pick)][1]

lines = (
    sb.table("fo_purchase_order_lines")
    .select("id, product_id, quantity, line_status")
    .eq("sheet_id", sheet_id)
    .eq("line_status", "pending")
    .execute()
    .data
    or []
)

if not lines:
    st.warning("이 주문서에 pending 라인이 없습니다. 새로고침해 보세요.")
    st.stop()

pids = [str(x["product_id"]) for x in lines]
pmap: dict[str, dict] = {}
for row in (
    sb.table("fo_products")
    .select("id, product_code, display_name, category, cost_price")
    .in_("id", pids)
    .execute()
    .data
    or []
):
    pmap[str(row["id"])] = row

st.markdown("##### 미매입 라인 — 체크 후 하단 「상태 저장」")
st.caption("한 행에 **매입완료**와 **보류**를 동시에 켤 수 없습니다.")

rows_ui = []
for ln in lines:
    pid = str(ln["product_id"])
    pr = pmap.get(pid, {})
    rows_ui.append(
        {
            "line_id": ln["id"],
            "상품코드": pr.get("product_code", pid[:8]),
            "표시상품명": pr.get("display_name", ""),
            "주문수량": float(ln["quantity"]),
            "매입가(참고)": pr.get("cost_price", 0),
        }
    )

hdr1, hdr2, hdr3, hdr4 = st.columns([3, 1, 1, 1])
hdr1.caption("상품")
hdr2.caption("수량")
hdr3.caption("매입완료")
hdr4.caption("보류")

for ln in lines:
    lid = str(ln["id"])
    pr = pmap.get(str(ln["product_id"]), {})
    name = pr.get("display_name", "")
    code = pr.get("product_code", "")
    col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
    with col1:
        st.write(f"**{code}**  {name}")
    with col2:
        st.write(f"{float(ln['quantity']):g}")
    with col3:
        st.checkbox("완료", key=f"fo_pur_recv_{lid}", label_visibility="collapsed")
    with col4:
        st.checkbox("보류", key=f"fo_pur_def_{lid}", label_visibility="collapsed")

sh_meta = next((x for x in sheets if str(x["id"]) == sheet_id), None)
if sh_meta:
    df_hist = pd.DataFrame([{k: v for k, v in r.items() if k != "line_id"} for r in rows_ui])
    store_pdf = fetch_store_for_order_header(sb, store_id)
    pdf_b = order_sheet_pdf_bytes(
        store=store_pdf,
        document_title="매입 처리용 주문서 (미매입 라인)",
        subtitle=str(sh_meta.get("title") or ""),
        lines_df=df_hist if not df_hist.empty else pd.DataFrame(),
    )
    st.download_button(
        "선택 주문서 PDF (참고·인쇄)",
        data=pdf_b,
        file_name=f"fo_purchase_work_{store_code}_{sheet_id[:8]}.pdf",
        mime="application/pdf",
    )

if st.button("상태 저장", type="primary", key="fo_pur_save"):
    err = False
    updates = []
    for ln in lines:
        lid = str(ln["id"])
        recv = bool(st.session_state.get(f"fo_pur_recv_{lid}", False))
        defr = bool(st.session_state.get(f"fo_pur_def_{lid}", False))
        if recv and defr:
            st.error(f"라인 {lid[:8]}… 매입완료와 보류를 동시에 선택할 수 없습니다.")
            err = True
            break
        if recv:
            updates.append({"id": lid, "line_status": "received"})
        elif defr:
            updates.append({"id": lid, "line_status": "deferred"})
    if err:
        st.stop()
    if not updates:
        st.info("변경할 체크가 없습니다.")
        st.stop()
    try:
        for u in updates:
            sb.table("fo_purchase_order_lines").update({"line_status": u["line_status"]}).eq("id", u["id"]).execute()
        st.success(f"{len(updates)}건 반영했습니다.")
        for u in updates:
            st.session_state.pop(f"fo_pur_recv_{u['id']}", None)
            st.session_state.pop(f"fo_pur_def_{u['id']}", None)
        st.rerun()
    except Exception as ex:
        st.error(f"저장 실패: {ex}")
