"""주문(발주) — 적정재고 부족 / 판매 기반 주문서·인쇄"""

from __future__ import annotations

import csv
import io
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="주문 리스트 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import get_data_entry_start_date, today_kst  # noqa: E402
from lib.purchase_orders import aggregate_sold_quantities_by_product  # noqa: E402
from lib.report_export import order_sheet_pdf_bytes  # noqa: E402
from lib.schema_guard import (  # noqa: E402
    stop_if_inventory_migration_missing,
    stop_if_purchase_orders_migration_missing,
)
from lib.store_defaults import (  # noqa: E402
    default_store_index,
    fetch_store_for_order_header,
)
from lib.streamlit_fo_stores import load_stores_with_business_fields_or_halt  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("주문(발주) 리스트")
st.caption(
    "「적정재고 부족」은 재고·적정 기준 발주 후보입니다. "
    "「판매 기반 주문서」는 기간 판매량을 합쳐 매입 발주용 주문서를 만들고 PDF로 인쇄할 수 있습니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stores = [s for s in load_stores_with_business_fields_or_halt(sb) if s.get("active", True)]
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]

tab_targets, tab_sales = st.tabs(["적정재고 부족", "판매 기반 주문서"])

with tab_targets:
    stop_if_inventory_migration_missing(sb)
    st.markdown("##### 발주 대상 지점")
    sp = st.selectbox("지점", store_labels, index=default_store_index(stores), key="fo_ord_store_tgt")
    _si = store_labels.index(sp)
    store_id = stores[_si]["id"]
    store_code = stores[_si]["store_code"]

    st.caption(
        "적정재고는 **재고 현황**에서 등록합니다. 북촌 No Public만 보려면 재고 현황에서 「No Public만」 필터를 활용하세요."
    )
    st.page_link("pages/06_재고현황.py", label="→ 재고 현황 · 적정재고")

    targets = (
        sb.table("fo_stock_targets").select("product_id, optimal_quantity").eq("store_id", store_id).execute().data
        or []
    )
    stocks = sb.table("fo_stock").select("product_id, quantity").eq("store_id", store_id).execute().data or []
    qty_by_pid: dict[str, float] = {str(s["product_id"]): float(s["quantity"]) for s in stocks}

    need = []
    for t in targets:
        pid = str(t["product_id"])
        opt = float(t["optimal_quantity"])
        if opt <= 0:
            continue
        cur = qty_by_pid.get(pid, 0.0)
        if cur < opt:
            need.append({"product_id": pid, "current": cur, "optimal": opt, "gap": opt - cur})

    if not need:
        st.success("적정 미달 품목이 없습니다.")
    else:
        pids = [n["product_id"] for n in need]
        products: dict[str, dict] = {}
        for row in (
            sb.table("fo_products")
            .select("id, product_code, display_name, category, sale_price, cost_price")
            .in_("id", pids)
            .execute()
            .data
            or []
        ):
            products[str(row["id"])] = row

        table = []
        for n in need:
            pr = products.get(n["product_id"], {})
            table.append(
                {
                    "상품코드": pr.get("product_code", ""),
                    "표시상품명": pr.get("display_name", ""),
                    "카테고리": pr.get("category", ""),
                    "현재고": n["current"],
                    "적정재고": n["optimal"],
                    "부족수량": n["gap"],
                    "실판매가": pr.get("sale_price", 0),
                    "매입가": pr.get("cost_price", 0),
                }
            )

        st.dataframe(table, hide_index=True, use_container_width=True)

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(table[0].keys())
        for row in table:
            w.writerow(row.values())
        csv_bytes = buf.getvalue().encode("utf-8-sig")
        fn = f"fo_reorder_{store_code}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
        st.download_button("CSV 다운로드 (UTF-8 BOM)", data=csv_bytes, file_name=fn, mime="text/csv")

with tab_sales:
    stop_if_purchase_orders_migration_missing(sb)
    st.markdown("##### 판매 집계 → 발주 주문서")
    st.caption(
        "선택 기간·지점의 **POS 판매 라인 수량**을 상품별로 합산해 주문서를 저장합니다. "
        "저장 후 **매입처리**에서 미매입 건만 이어서 처리하고, **보류**한 품목은 이후 목록에서 제외됩니다."
    )
    st.page_link("pages/13_매입처리.py", label="→ 매입처리")

    c1, c2, c3 = st.columns(3)
    with c1:
        sp2 = st.selectbox("지점", store_labels, index=default_store_index(stores), key="fo_ord_store_sales")
    _si2 = store_labels.index(sp2)
    store_id_s = stores[_si2]["id"]
    store_code_s = stores[_si2]["store_code"]
    with c2:
        d0 = st.date_input(
            "판매 집계 시작일",
            value=today_kst() - timedelta(days=6),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_po_d0",
        )
    with c3:
        d1 = st.date_input(
            "판매 집계 종료일",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_po_d1",
        )

    if d0 > d1:
        st.error("시작일이 종료일보다 늦습니다.")
        st.stop()

    agg = aggregate_sold_quantities_by_product(sb, str(store_id_s), d0, d1)
    if not agg:
        st.info("해당 기간·지점에 판매 라인이 없습니다.")
    else:
        pids_s = [x["product_id"] for x in agg]
        pmap: dict[str, dict] = {}
        for row in (
            sb.table("fo_products")
            .select("id, product_code, display_name, category, cost_price, supplier_id")
            .in_("id", pids_s)
            .execute()
            .data
            or []
        ):
            pmap[str(row["id"])] = row

        prev = []
        for row in agg:
            pr = pmap.get(row["product_id"], {})
            prev.append(
                {
                    "상품코드": pr.get("product_code", row["product_id"][:8]),
                    "표시상품명": pr.get("display_name", ""),
                    "카테고리": pr.get("category", ""),
                    "판매수량합": row["quantity"],
                    "매입가(참고)": pr.get("cost_price", 0),
                }
            )
        st.dataframe(prev, hide_index=True, use_container_width=True)

        df_pdf = pd.DataFrame(prev)
        st_meta = fetch_store_for_order_header(sb, str(store_id_s))
        pdf_b = order_sheet_pdf_bytes(
            store=st_meta,
            document_title="발주 주문서 (판매 집계)",
            subtitle=f"집계 기간: {d0.isoformat()} ~ {d1.isoformat()}",
            lines_df=df_pdf,
        )
        st.download_button(
            "주문서 PDF (인쇄용)",
            data=pdf_b,
            file_name=f"fo_order_{store_code_s}_{d0}_{d1}.pdf",
            mime="application/pdf",
        )

        note = st.text_input("주문서 비고(선택)", key="fo_po_note", placeholder="예: 안목 발주")
        if st.button("이 내용으로 주문서 저장", type="primary", key="fo_po_save"):
            title = f"판매집계 {store_code_s} {d0.isoformat()}~{d1.isoformat()}"
            try:
                sh = (
                    sb.table("fo_purchase_order_sheets")
                    .insert(
                        {
                            "store_id": str(store_id_s),
                            "period_start": d0.isoformat(),
                            "period_end": d1.isoformat(),
                            "title": title,
                            "note": (note or "").strip() or None,
                        }
                    )
                    .execute()
                    .data
                )
                if not sh:
                    st.error("주문서 헤더 저장 실패")
                    st.stop()
                sid = sh[0]["id"]
                batch = [
                    {
                        "sheet_id": sid,
                        "product_id": r["product_id"],
                        "quantity": float(r["quantity"]),
                        "line_status": "pending",
                    }
                    for r in agg
                ]
                sb.table("fo_purchase_order_lines").insert(batch).execute()
                st.success(f"저장 완료. **매입처리**에서 주문서를 선택하세요. (id 앞 8자: `{str(sid)[:8]}…`)")
                st.balloons()
            except Exception as ex:
                st.error(f"저장 실패: {ex}")

    st.markdown("##### 최근 주문서")
    recent = (
        sb.table("fo_purchase_order_sheets")
        .select("id, title, period_start, period_end, created_at")
        .eq("store_id", str(store_id_s))
        .order("created_at", desc=True)
        .limit(15)
        .execute()
        .data
        or []
    )
    if recent:
        for r in recent:
            lines = (
                sb.table("fo_purchase_order_lines")
                .select("line_status")
                .eq("sheet_id", r["id"])
                .execute()
                .data
                or []
            )
            np = sum(1 for x in lines if x.get("line_status") == "pending")
            st.caption(f"· {r.get('title', '')} — 미처리 **{np}**건 / {r.get('period_start')} ~ {r.get('period_end')}")
    else:
        st.caption("저장된 주문서가 없습니다.")
