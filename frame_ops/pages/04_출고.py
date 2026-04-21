"""출고 — 출고지점(수신지점) 필수 선택 → fo_interstore_transfers(승인 대기) 생성."""

from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="출고 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import (  # noqa: E402
    business_date_to_timestamptz,
    get_data_entry_start_date,
    iso_to_kst_date,
    today_kst,
)
from lib.fo_product_pick_utils import (  # noqa: E402
    brand_grid_cols,
    brand_page_size,
    load_all_brands,
    load_distinct_color_codes,
    load_distinct_style_codes,
)
from lib.schema_guard_extended import stop_if_returns_migration_missing  # noqa: E402
from lib.settlement_guard import is_business_day_settled, settled_warning_message  # noqa: E402
from lib.stock import bump_stock, find_product  # noqa: E402
from lib.store_defaults import default_store_index  # noqa: E402
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("출고")
st.caption(
    f"출고지점(수신지점)을 선택하고 상품을 추가하면, **매장 간 이동 전표**가 생성됩니다. "
    f"수신 지점에서 **승인**해야 재고가 이동합니다. "
    f"전표일은 **{get_data_entry_start_date().isoformat()}** 이후만 선택할 수 있습니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_returns_migration_missing(sb)

# ── 브랜드→제품번호→칼라 다이얼로그 session keys ────────────────
_KB_DLG = "fo_out_br_dlg"
_KB_PG = "fo_out_br_pg"
_KS_DLG = "fo_out_st_dlg"
_KS_PG = "fo_out_st_pg"
_KC_DLG = "fo_out_co_dlg"
_KC_PG = "fo_out_co_pg"


@st.dialog("브랜드 선택")
def _out_pick_brand() -> None:
    brands = load_all_brands(sb)
    if not brands:
        st.warning("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="ob_br_close_e"):
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
                    if st.button(nm, key=f"ob_br_{s0}_{idx}", use_container_width=True):
                        st.session_state["fo_out_brand_id"] = str(h["id"])
                        st.session_state["fo_out_brand_name"] = nm
                        st.session_state["fo_out_style"] = ""
                        st.session_state["fo_out_color"] = ""
                        st.session_state.pop(_KB_DLG, None)
                        st.session_state.pop(_KB_PG, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ob_br_close"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < n and st.button("다음", key="ob_br_next"):
            st.session_state[_KB_PG] = pg + 1
            st.rerun()


@st.dialog("제품번호 선택")
def _out_pick_style() -> None:
    bid = st.session_state.get("fo_out_brand_id")
    if not bid:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="ob_st_close_e"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(sb, str(bid))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다.")
        if st.button("닫기", key="ob_st_close_n"):
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
                if st.button(sc, key=f"ob_st_{s0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_out_style"] = sc
                    st.session_state["fo_out_color"] = ""
                    st.session_state.pop(_KS_DLG, None)
                    st.session_state.pop(_KS_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ob_st_close"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < len(styles) and st.button("다음", key="ob_st_next"):
            st.session_state[_KS_PG] = pg + 1
            st.rerun()


@st.dialog("칼라 선택")
def _out_pick_color() -> None:
    bid = st.session_state.get("fo_out_brand_id")
    stv = (st.session_state.get("fo_out_style") or "").strip()
    if not bid or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="ob_co_close_e"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(sb, str(bid), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="ob_co_close_n"):
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
                if st.button(cc, key=f"ob_co_{c0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_out_color"] = cc
                    st.session_state.pop(_KC_DLG, None)
                    st.session_state.pop(_KC_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="ob_co_close"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
    with nr:
        if c0 + ps < len(colors) and st.button("다음", key="ob_co_next"):
            st.session_state[_KC_PG] = pg + 1
            st.rerun()


# ── 지점 목록 ──────────────────────────────────────────────────
stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

if len(stores) < 2:
    st.warning("출고(매장 간 이동)를 사용하려면 지점이 2곳 이상이어야 합니다.")
    st.stop()

store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
store_by_id = {s["id"]: s for s in stores}

# ── 전표 설정: 지점 → 전표일 → 출고지점(수신지점) ─────────────
with st.container():
    st.markdown("##### 전표 설정")
    h1, h2 = st.columns(2)
    with h1:
        sp = st.selectbox("발송 지점 (내 지점)", store_labels, index=default_store_index(stores), key="fo_out_from")
        from_store_id = stores[store_labels.index(sp)]["id"]
    with h2:
        doc_day = st.date_input(
            "전표 일자",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_out_doc_day",
            help="정산된 영업일에는 출고를 저장할 수 없습니다.",
        )

    to_labels = [l for l in store_labels if stores[store_labels.index(l)]["id"] != from_store_id]
    if not to_labels:
        st.error("출고할 수 있는 다른 지점이 없습니다.")
        st.stop()
    to_lab = st.selectbox("출고지점 (수신지점)", to_labels, key="fo_out_to")
    to_store_id = stores[store_labels.index(to_lab)]["id"]

out_locked = is_business_day_settled(sb, from_store_id, doc_day)
if out_locked:
    st.warning(settled_warning_message(doc_day))

# ── 출고 카트 ──────────────────────────────────────────────────
if "fo_out_cart" not in st.session_state:
    st.session_state.fo_out_cart = []

tab_code, tab_pick = st.tabs(["상품코드/바코드", "브랜드·제품번호·칼라 선택"])

with tab_code:
    with st.form("add_out_line", clear_on_submit=True):
        lk = st.text_input("상품코드/바코드")
        q = st.number_input("수량", min_value=0.01, value=1.0, step=1.0)
        uc = st.number_input("이동 단가(원·매입가)", min_value=0, value=0, step=1000)
        if st.form_submit_button("행 추가"):
            if out_locked:
                st.error("정산된 일자에는 행을 추가할 수 없습니다.")
            else:
                p = find_product(sb, lk)
                if not p:
                    st.error("상품을 찾을 수 없습니다.")
                else:
                    cost = int(uc) if uc > 0 else int(p.get("cost_price") or 0)
                    st.session_state.fo_out_cart.append(
                        {
                            "product_id": p["id"],
                            "product_code": p["product_code"],
                            "display_name": p["display_name"],
                            "quantity": float(q),
                            "unit_cost": cost,
                        }
                    )
                    st.rerun()

with tab_pick:
    st.caption("POS 판매와 동일한 방식으로 상품을 선택합니다.")
    bc1, bc2, bc3 = st.columns(3)
    with bc1:
        st.text((st.session_state.get("fo_out_brand_name") or "").strip() or "—")
        if st.button("브랜드 선택", key="ob_btn_brand"):
            st.session_state[_KB_DLG] = True
            st.session_state[_KB_PG] = 0
            st.rerun()
    with bc2:
        st.text((st.session_state.get("fo_out_style") or "").strip() or "—")
        if st.button("제품번호 선택", key="ob_btn_style"):
            st.session_state[_KS_DLG] = True
            st.session_state[_KS_PG] = 0
            st.rerun()
    with bc3:
        st.text((st.session_state.get("fo_out_color") or "").strip() or "—")
        if st.button("칼라 선택", key="ob_btn_color"):
            st.session_state[_KC_DLG] = True
            st.session_state[_KC_PG] = 0
            st.rerun()

    _bid = st.session_state.get("fo_out_brand_id")
    _sty = (st.session_state.get("fo_out_style") or "").strip()
    _col = (st.session_state.get("fo_out_color") or "").strip()
    _pick_product = None
    if _bid and _sty and _col:
        _pr = (
            sb.table("fo_products")
            .select("id,product_code,display_name,cost_price")
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

    pk_q = st.number_input("수량", min_value=0.01, value=1.0, step=1.0, key="ob_pick_qty")
    pk_uc = st.number_input(
        "이동 단가(원·매입가)",
        min_value=0,
        value=int(_pick_product.get("cost_price") or 0) if _pick_product else 0,
        step=1000,
        key="ob_pick_uc",
    )

    if st.button("행 추가", key="ob_pick_add", type="primary", disabled=_pick_product is None):
        if out_locked:
            st.error("정산된 일자에는 행을 추가할 수 없습니다.")
        elif _pick_product:
            cost = int(pk_uc) if pk_uc > 0 else int(_pick_product.get("cost_price") or 0)
            st.session_state.fo_out_cart.append(
                {
                    "product_id": _pick_product["id"],
                    "product_code": _pick_product["product_code"],
                    "display_name": _pick_product["display_name"],
                    "quantity": float(pk_q),
                    "unit_cost": cost,
                }
            )
            st.session_state["fo_out_brand_id"] = ""
            st.session_state["fo_out_brand_name"] = ""
            st.session_state["fo_out_style"] = ""
            st.session_state["fo_out_color"] = ""
            st.rerun()

if st.session_state.get(_KB_DLG):
    _out_pick_brand()
if st.session_state.get(_KS_DLG):
    _out_pick_style()
if st.session_state.get(_KC_DLG):
    _out_pick_color()

# ── 카트 표시 + 저장 ──────────────────────────────────────────
if st.session_state.fo_out_cart:
    st.subheader("출고 예정 라인")
    to_name = store_by_id.get(to_store_id, {}).get("name", "")
    st.caption(f"출고지점(수신): **{to_name}** — 수신 지점에서 승인 시 재고가 이동됩니다.")

    for i, line in enumerate(st.session_state.fo_out_cart):
        c0, c1 = st.columns([5, 1])
        with c0:
            st.write(
                f"{line['display_name']} ({line['product_code']}) × {line['quantity']}"
                f" @ {line['unit_cost']:,}원"
            )
        with c1:
            if st.button("제거", key=f"out_rm_{i}"):
                st.session_state.fo_out_cart.pop(i)
                st.rerun()

    note = st.text_area("비고", placeholder="예: 샘플 출고, 지점 재고 이동 등")
    if st.button("출고 전표 저장 (수신 측 승인 대기)", type="primary"):
        if out_locked:
            st.error("정산된 일자에는 전표를 저장할 수 없습니다.")
        else:
            tid = str(uuid.uuid4())
            doc_at = business_date_to_timestamptz(doc_day)
            try:
                sb.table("fo_interstore_transfers").insert(
                    {
                        "id": tid,
                        "from_store_id": from_store_id,
                        "to_store_id": to_store_id,
                        "document_at": doc_at,
                        "status": "pending_approval",
                        "note": (note or "").strip() or None,
                    }
                ).execute()
                for line in st.session_state.fo_out_cart:
                    sb.table("fo_interstore_transfer_lines").insert(
                        {
                            "transfer_id": tid,
                            "product_id": line["product_id"],
                            "quantity": line["quantity"],
                            "unit_cost": line["unit_cost"],
                        }
                    ).execute()
                st.session_state.fo_out_cart = []
                st.success(
                    f"출고 등록 완료 (전표 `{tid[:8]}…`). "
                    f"**{to_name}** 수신함에서 승인하면 재고가 이동됩니다."
                )
                st.rerun()
            except Exception as ex:
                st.error(f"저장 실패: {ex}")

# ── 최근 출고(이동) 전표 ──────────────────────────────────────
st.subheader("최근 출고 전표")
st.caption("이 지점에서 발송한 매장 간 이동 전표입니다.")
recs = (
    sb.table("fo_interstore_transfers")
    .select("id,to_store_id,document_at,status,note,created_at")
    .eq("from_store_id", from_store_id)
    .order("created_at", desc=True)
    .limit(30)
    .execute()
    .data
    or []
)
if recs:
    _status_label = {
        "pending_approval": "승인 대기",
        "on_hold": "보류",
        "approved": "승인(이동 완료)",
        "rejected": "거절",
    }
    for r in recs:
        to_n = store_by_id.get(r["to_store_id"], {}).get("name", str(r["to_store_id"])[:8])
        sl = _status_label.get(r.get("status", ""), r.get("status", ""))
        with st.expander(f"{r['document_at'][:19]} → {to_n} / **{sl}**"):
            lines = (
                sb.table("fo_interstore_transfer_lines")
                .select("product_id,quantity,unit_cost")
                .eq("transfer_id", r["id"])
                .execute()
                .data
                or []
            )
            pids = list({str(x["product_id"]) for x in lines})
            pmap = {}
            if pids:
                for row in (
                    sb.table("fo_products")
                    .select("id,product_code,display_name")
                    .in_("id", pids)
                    .execute()
                    .data or []
                ):
                    pmap[str(row["id"])] = row
            rows = []
            for ln in lines:
                pr = pmap.get(str(ln["product_id"]), {})
                rows.append({
                    "상품코드": pr.get("product_code"),
                    "상품명": pr.get("display_name"),
                    "수량": ln["quantity"],
                    "단가": ln["unit_cost"],
                })
            st.dataframe(rows, hide_index=True, use_container_width=True)
            if r.get("note"):
                st.caption(f"비고: {r['note']}")
else:
    st.info("출고 이력이 없습니다.")

st.page_link("pages/10_매장간이동.py", label="→ 매장 간 이동 (수신함·발송 현황)")
