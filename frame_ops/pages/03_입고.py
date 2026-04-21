"""입고 전표 — fo_inbound_receipts / fo_inbound_lines"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="입고 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import business_date_to_timestamptz, get_data_entry_start_date, today_kst  # noqa: E402
from lib.fo_product_pick_utils import (  # noqa: E402
    brand_grid_cols,
    brand_page_size,
    load_all_brands,
    load_distinct_color_codes,
    load_distinct_style_codes,
)
from lib.schema_guard import stop_if_inventory_migration_missing  # noqa: E402
from lib.settlement_guard import is_business_day_settled, settled_warning_message  # noqa: E402
from lib.stock import bump_stock, find_product  # noqa: E402
from lib.store_defaults import default_store_index, default_supplier_option_index  # noqa: E402
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("입고")
st.caption(
    f"입고 전표는 삭제하지 않고 조회합니다. 재고가 증가합니다. "
    f"전표일은 **{get_data_entry_start_date().isoformat()}** 이후만 선택할 수 있습니다. "
    "북촌점 **No Public** 라인은 매입처 **안목**으로 맞추는 것을 권장합니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_inventory_migration_missing(sb)

# ── 브랜드→제품번호→칼라 다이얼로그 session keys ────────────────
_KB_DLG = "fo_inb_br_dlg"
_KB_PG = "fo_inb_br_pg"
_KS_DLG = "fo_inb_st_dlg"
_KS_PG = "fo_inb_st_pg"
_KC_DLG = "fo_inb_co_dlg"
_KC_PG = "fo_inb_co_pg"


@st.dialog("브랜드 선택")
def _inb_pick_brand() -> None:
    brands = load_all_brands(sb)
    if not brands:
        st.warning("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="ib_br_close_e"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
        return
    n = len(brands)
    ps = brand_page_size(n)
    pg = int(st.session_state.get(_KB_PG, 0))
    s0 = pg * ps
    chunk = brands[s0 : s0 + ps]
    cn = brand_grid_cols(ps)
    idx = 0
    for _ in range((ps + cn - 1) // cn):
        cols = st.columns(cn)
        for c in range(cn):
            with cols[c]:
                if idx < len(chunk):
                    h = chunk[idx]
                    nm = str(h.get("name") or "")
                    if st.button(nm, key=f"ib_br_{s0}_{idx}", use_container_width=True):
                        st.session_state["fo_inb_brand_id"] = str(h["id"])
                        st.session_state["fo_inb_brand_name"] = nm
                        st.session_state["fo_inb_style"] = ""
                        st.session_state["fo_inb_color"] = ""
                        st.session_state.pop(_KB_DLG, None)
                        st.session_state.pop(_KB_PG, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ib_br_close"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < n and st.button("다음", key="ib_br_next"):
            st.session_state[_KB_PG] = pg + 1
            st.rerun()


@st.dialog("제품번호 선택")
def _inb_pick_style() -> None:
    bid = st.session_state.get("fo_inb_brand_id")
    if not bid:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="ib_st_close_e"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(sb, str(bid))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다.")
        if st.button("닫기", key="ib_st_close_n"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    ps = 15
    pg = int(st.session_state.get(_KS_PG, 0))
    s0 = pg * ps
    page_items = styles[s0 : s0 + ps]
    st.caption(f"총 **{len(styles)}**개 · {pg + 1}페이지")
    nc = 5
    for ri in range(0, len(page_items), nc):
        row_items = page_items[ri : ri + nc]
        cols = st.columns(nc)
        for j, sc in enumerate(row_items):
            with cols[j]:
                if st.button(sc, key=f"ib_st_{s0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_inb_style"] = sc
                    st.session_state["fo_inb_color"] = ""
                    st.session_state.pop(_KS_DLG, None)
                    st.session_state.pop(_KS_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ib_st_close"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < len(styles) and st.button("다음", key="ib_st_next"):
            st.session_state[_KS_PG] = pg + 1
            st.rerun()


@st.dialog("칼라 선택")
def _inb_pick_color() -> None:
    bid = st.session_state.get("fo_inb_brand_id")
    stv = (st.session_state.get("fo_inb_style") or "").strip()
    if not bid or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="ib_co_close_e"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(sb, str(bid), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="ib_co_close_n"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    ps = 6
    pg = int(st.session_state.get(_KC_PG, 0))
    c0 = pg * ps
    page_items = colors[c0 : c0 + ps]
    st.caption(f"총 **{len(colors)}**개 · {pg + 1}페이지")
    nc = 3
    for ri in range(0, len(page_items), nc):
        row_items = page_items[ri : ri + nc]
        cols = st.columns(nc)
        for j, cc in enumerate(row_items):
            with cols[j]:
                if st.button(cc, key=f"ib_co_{c0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_inb_color"] = cc
                    st.session_state.pop(_KC_DLG, None)
                    st.session_state.pop(_KC_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ib_co_close"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
    with nr:
        if c0 + ps < len(colors) and st.button("다음", key="ib_co_next"):
            st.session_state[_KC_PG] = pg + 1
            st.rerun()

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

with st.container():
    st.markdown("##### 전표 설정")
    h1, h2 = st.columns(2)
    with h1:
        store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
        sp = st.selectbox("지점", store_labels, index=default_store_index(stores))
        store_id = stores[store_labels.index(sp)]["id"]
    with h2:
        doc_day = st.date_input(
            "전표 일자",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_inb_doc_day",
            help="해당 영업일 기준으로 기록되며, 정산된 일자에는 저장할 수 없습니다.",
        )

    suppliers = sb.table("fo_suppliers").select("id, name").execute().data or []
    sup_opts = ["(없음)"] + [x["name"] for x in suppliers]
    sup_map = {x["name"]: x["id"] for x in suppliers}
    sup_name = st.selectbox(
        "매입처",
        sup_opts,
        index=default_supplier_option_index(sup_opts),
        key="fo_inb_sup_sel",
    )
    selected_supplier_id = sup_map.get(sup_name) if sup_name != "(없음)" else None

inb_locked = is_business_day_settled(sb, store_id, doc_day)
if inb_locked:
    st.warning(settled_warning_message(doc_day))

if "fo_inb_cart" not in st.session_state:
    st.session_state.fo_inb_cart = []

tab_code, tab_pick, tab_po = st.tabs(["상품코드/바코드", "브랜드·제품번호·칼라 선택", "주문리스트에서 불러오기"])

# ── 탭1: 상품코드/바코드 직접 입력 ─────────────────────────────
with tab_code:
    with st.form("add_inb_line", clear_on_submit=True):
        lk = st.text_input("상품코드/바코드")
        q = st.number_input("수량", min_value=0.01, value=1.0, step=1.0)
        uc = st.number_input("매입단가(원)", min_value=0, value=0, step=1000)
        spo = st.number_input("실판매가 덮어쓰기(원, 0=유지)", min_value=0, value=0, step=1000)
        if st.form_submit_button("행 추가"):
            if inb_locked:
                st.error("정산된 일자에는 행을 추가할 수 없습니다.")
            else:
                p = find_product(sb, lk)
                if not p:
                    st.error("상품을 찾을 수 없습니다.")
                else:
                    st.session_state.fo_inb_cart.append(
                        {
                            "product_id": p["id"],
                            "product_code": p["product_code"],
                            "display_name": p["display_name"],
                            "quantity": float(q),
                            "unit_cost": int(uc),
                            "sale_price_override": int(spo) if spo > 0 else None,
                        }
                    )
                    st.rerun()

# ── 탭2: 브랜드→제품번호→칼라 선택 ────────────────────────────
with tab_pick:
    st.caption("POS 판매와 동일한 방식으로 상품을 선택합니다.")
    bc1, bc2, bc3 = st.columns(3)
    with bc1:
        st.text((st.session_state.get("fo_inb_brand_name") or "").strip() or "—")
        if st.button("브랜드 선택", key="ib_btn_brand"):
            st.session_state[_KB_DLG] = True
            st.session_state[_KB_PG] = 0
            st.rerun()
    with bc2:
        st.text((st.session_state.get("fo_inb_style") or "").strip() or "—")
        if st.button("제품번호 선택", key="ib_btn_style"):
            st.session_state[_KS_DLG] = True
            st.session_state[_KS_PG] = 0
            st.rerun()
    with bc3:
        st.text((st.session_state.get("fo_inb_color") or "").strip() or "—")
        if st.button("칼라 선택", key="ib_btn_color"):
            st.session_state[_KC_DLG] = True
            st.session_state[_KC_PG] = 0
            st.rerun()

    _bid = st.session_state.get("fo_inb_brand_id")
    _sty = (st.session_state.get("fo_inb_style") or "").strip()
    _col = (st.session_state.get("fo_inb_color") or "").strip()
    _pick_product = None
    if _bid and _sty and _col:
        _pr = (
            sb.table("fo_products")
            .select("id,product_code,display_name,cost_price,sale_price")
            .eq("brand_id", _bid)
            .eq("style_code", _sty)
            .eq("color_code", _col)
            .limit(1)
            .execute()
            .data or []
        )
        _pick_product = _pr[0] if _pr else None
        if _pick_product:
            st.success(f"선택: **{_pick_product['display_name']}** (`{_pick_product['product_code']}`)")
        else:
            st.warning("브랜드+제품번호+칼라 조합에 해당하는 상품이 없습니다.")

    pk_q = st.number_input("수량", min_value=0.01, value=1.0, step=1.0, key="ib_pick_qty")
    pk_uc = st.number_input("매입단가(원)", min_value=0, value=int(_pick_product.get("cost_price") or 0) if _pick_product else 0, step=1000, key="ib_pick_uc")
    pk_spo = st.number_input("실판매가 덮어쓰기(원, 0=유지)", min_value=0, value=0, step=1000, key="ib_pick_spo")

    if st.button("행 추가", key="ib_pick_add", type="primary", disabled=_pick_product is None):
        if inb_locked:
            st.error("정산된 일자에는 행을 추가할 수 없습니다.")
        elif _pick_product:
            st.session_state.fo_inb_cart.append(
                {
                    "product_id": _pick_product["id"],
                    "product_code": _pick_product["product_code"],
                    "display_name": _pick_product["display_name"],
                    "quantity": float(pk_q),
                    "unit_cost": int(pk_uc),
                    "sale_price_override": int(pk_spo) if pk_spo > 0 else None,
                }
            )
            st.session_state["fo_inb_brand_id"] = ""
            st.session_state["fo_inb_brand_name"] = ""
            st.session_state["fo_inb_style"] = ""
            st.session_state["fo_inb_color"] = ""
            st.rerun()

# ── 다이얼로그 렌더링 ─────────────────────────────────────────
if st.session_state.get(_KB_DLG):
    _inb_pick_brand()
if st.session_state.get(_KS_DLG):
    _inb_pick_style()
if st.session_state.get(_KC_DLG):
    _inb_pick_color()

# ── 탭3: 주문리스트(발주서) 불러오기 → 매입처리 ────────────────
with tab_po:
    if not selected_supplier_id:
        st.info("상단 **전표 설정**에서 **매입처**를 먼저 선택하세요. 해당 매입처와 매칭된 주문서를 불러옵니다.")
    else:
        st.caption(
            f"매입처 **{sup_name}** 와 매칭된 주문서(발주서)의 **미처리(pending)** 라인을 "
            "불러와 입고 카트에 일괄 추가할 수 있습니다."
        )

        # 선택된 매입처에 연결된 상품 ID 목록
        _sup_product_ids: set[str] = set()
        try:
            _sp_rows = (
                sb.table("fo_products")
                .select("id")
                .eq("supplier_id", selected_supplier_id)
                .limit(5000)
                .execute()
                .data or []
            )
            _sup_product_ids = {str(r["id"]) for r in _sp_rows}
        except Exception:
            pass

        _po_sheets = []
        try:
            _po_sheets = (
                sb.table("fo_purchase_order_sheets")
                .select("id,title,period_start,period_end,store_id,created_at")
                .eq("store_id", store_id)
                .order("created_at", desc=True)
                .limit(30)
                .execute()
                .data or []
            )
        except Exception:
            pass

        if not _po_sheets:
            st.info("이 지점에 저장된 주문서가 없습니다. **주문리스트** 화면에서 먼저 주문서를 생성하세요.")
            st.page_link("pages/07_주문리스트.py", label="→ 주문리스트")
        else:
            po_labels = [
                f"{s.get('title','')} ({s.get('period_start','')[:10]}~{s.get('period_end','')[:10]})"
                for s in _po_sheets
            ]
            po_pick = st.selectbox("주문서 선택", po_labels, key="ib_po_pick")
            po_sheet = _po_sheets[po_labels.index(po_pick)]

            po_lines_raw = (
                sb.table("fo_purchase_order_lines")
                .select("id,product_id,quantity,line_status")
                .eq("sheet_id", po_sheet["id"])
                .eq("line_status", "pending")
                .execute()
                .data or []
            )

            # 매입처에 해당하는 상품만 필터
            if _sup_product_ids:
                po_lines = [ln for ln in po_lines_raw if str(ln["product_id"]) in _sup_product_ids]
            else:
                po_lines = po_lines_raw

            total_pending = len(po_lines_raw)
            matched = len(po_lines)

            if not po_lines:
                if total_pending > 0:
                    st.info(
                        f"이 주문서에 미처리 **{total_pending}**건이 있지만 "
                        f"매입처 **{sup_name}** 의 상품과 매칭되는 건이 없습니다."
                    )
                else:
                    st.info("이 주문서에 미처리(pending) 라인이 없습니다.")
            else:
                po_pids = list({str(ln["product_id"]) for ln in po_lines})
                po_pmap: dict[str, dict] = {}
                for row in (
                    sb.table("fo_products")
                    .select("id,product_code,display_name,cost_price")
                    .in_("id", po_pids)
                    .execute()
                    .data or []
                ):
                    po_pmap[str(row["id"])] = row

                if matched < total_pending:
                    st.caption(f"전체 미처리 {total_pending}건 중 매입처 **{sup_name}** 매칭 **{matched}**건")
                else:
                    st.caption(f"미처리 **{matched}**건")

                po_display = []
                for ln in po_lines:
                    pr = po_pmap.get(str(ln["product_id"]), {})
                    po_display.append({
                        "line_id": ln["id"],
                        "product_id": ln["product_id"],
                        "상품코드": pr.get("product_code", ""),
                        "상품명": pr.get("display_name", ""),
                        "주문수량": ln["quantity"],
                        "매입가(참고)": pr.get("cost_price", 0),
                    })
                import pandas as pd
                st.dataframe(
                    pd.DataFrame(po_display).drop(columns=["line_id", "product_id"]),
                    use_container_width=True, hide_index=True,
                )

                sel_mode = st.radio("추가 방식", ["전체 추가", "선택 추가"], horizontal=True, key="ib_po_mode")

                if sel_mode == "선택 추가":
                    sel_opts = [f"{d['상품코드']} — {d['상품명']} ×{d['주문수량']}" for d in po_display]
                    sel_idx = st.multiselect("추가할 품목", sel_opts, key="ib_po_multi")
                    chosen = [po_display[sel_opts.index(s)] for s in sel_idx]
                else:
                    chosen = po_display

                if st.button("입고 카트에 추가", key="ib_po_add", type="primary", disabled=not chosen):
                    if inb_locked:
                        st.error("정산된 일자에는 행을 추가할 수 없습니다.")
                    else:
                        added = 0
                        line_ids_done = []
                        for item in chosen:
                            pr = po_pmap.get(str(item["product_id"]), {})
                            if pr:
                                st.session_state.fo_inb_cart.append({
                                    "product_id": pr["id"],
                                    "product_code": pr.get("product_code", ""),
                                    "display_name": pr.get("display_name", ""),
                                    "quantity": float(item["주문수량"]),
                                    "unit_cost": int(pr.get("cost_price") or 0),
                                    "sale_price_override": None,
                                })
                                line_ids_done.append(item["line_id"])
                                added += 1
                        if line_ids_done:
                            for lid in line_ids_done:
                                sb.table("fo_purchase_order_lines").update(
                                    {"line_status": "received"}
                                ).eq("id", lid).execute()
                        st.success(f"{added}건을 입고 카트에 추가하고 주문 라인을 **매입완료**로 변경했습니다.")
                        st.rerun()

if st.session_state.fo_inb_cart:
    st.subheader("입고 예정 라인")
    for i, line in enumerate(st.session_state.fo_inb_cart):
        c0, c1 = st.columns([5, 1])
        with c0:
            ov = line.get("sale_price_override")
            st.write(
                f"{line['display_name']} ({line['product_code']}) × {line['quantity']} "
                f"/ 매입 {line['unit_cost']:,}원"
                + (f" / 판매가→{ov:,}원" if ov else "")
            )
        with c1:
            if st.button("제거", key=f"inb_rm_{i}"):
                st.session_state.fo_inb_cart.pop(i)
                st.rerun()

    st.caption(f"매입처: **{sup_name}**" if selected_supplier_id else "매입처: (없음)")
    note = st.text_area("비고")
    if st.button("입고 전표 저장", type="primary"):
        if inb_locked:
            st.error("정산된 일자에는 전표를 저장할 수 없습니다.")
        else:
            sid = selected_supplier_id
            doc_id = str(uuid.uuid4())
            doc_at = business_date_to_timestamptz(doc_day)
            try:
                sb.table("fo_inbound_receipts").insert(
                    {"id": doc_id, "store_id": store_id, "supplier_id": sid, "document_at": doc_at, "note": note or None}
                ).execute()
                for line in st.session_state.fo_inb_cart:
                    sb.table("fo_inbound_lines").insert(
                        {
                            "inbound_receipt_id": doc_id,
                            "product_id": line["product_id"],
                            "quantity": line["quantity"],
                            "unit_cost": line["unit_cost"],
                            "sale_price_override": line.get("sale_price_override"),
                        }
                    ).execute()
                    bump_stock(sb, store_id, line["product_id"], float(line["quantity"]))
                    upd = {"cost_price": int(line["unit_cost"])}
                    if line.get("sale_price_override"):
                        upd["sale_price"] = int(line["sale_price_override"])
                    sb.table("fo_products").update(upd).eq("id", line["product_id"]).execute()
                st.session_state.fo_inb_cart = []
                st.success(f"입고 완료 (전표 {doc_id[:8]}…)")
                st.rerun()
            except Exception as ex:
                st.error(f"저장 실패: {ex}")

st.subheader("최근 입고 전표")
recs = (
    sb.table("fo_inbound_receipts")
    .select("id, document_at, note, supplier_id")
    .eq("store_id", store_id)
    .order("document_at", desc=True)
    .limit(30)
    .execute()
    .data
    or []
)
if recs:
    for r in recs:
        with st.expander(f"{r['document_at'][:19]} — {str(r['id'])[:8]}…"):
            lines = (
                sb.table("fo_inbound_lines")
                .select("product_id, quantity, unit_cost, sale_price_override")
                .eq("inbound_receipt_id", r["id"])
                .execute()
                .data
                or []
            )
            pids = list({str(x["product_id"]) for x in lines})
            pmap = {}
            if pids:
                for row in sb.table("fo_products").select("id, product_code, display_name").in_("id", pids).execute().data or []:
                    pmap[str(row["id"])] = row
            rows = []
            for ln in lines:
                pr = pmap.get(str(ln["product_id"]), {})
                rows.append(
                    {
                        "상품코드": pr.get("product_code"),
                        "상품명": pr.get("display_name"),
                        "수량": ln["quantity"],
                        "매입단가": ln["unit_cost"],
                        "판매가덮어쓰기": ln.get("sale_price_override"),
                    }
                )
            st.dataframe(rows, hide_index=True, use_container_width=True)
            st.caption(f"비고: {r.get('note') or '-'}")
else:
    st.info("입고 이력이 없습니다.")
