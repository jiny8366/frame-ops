"""반품 — 손망실 시 재고 미반영·손망실 조회, 비손망실 시 재고 복귀."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="반품 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import business_date_to_timestamptz, get_data_entry_start_date, now_kst_iso, today_kst  # noqa: E402
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
from lib.store_defaults import default_store_index, default_supplier_option_index  # noqa: E402
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("반품")

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stop_if_returns_migration_missing(sb)

# ── 브랜드→제품번호→칼라 다이얼로그 ───────────────────────────
_KB_DLG = "fo_ret_br_dlg"
_KB_PG = "fo_ret_br_pg"
_KS_DLG = "fo_ret_st_dlg"
_KS_PG = "fo_ret_st_pg"
_KC_DLG = "fo_ret_co_dlg"
_KC_PG = "fo_ret_co_pg"


@st.dialog("브랜드 선택")
def _ret_pick_brand() -> None:
    brands = load_all_brands(sb)
    if not brands:
        st.warning("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="rt_br_close_e"):
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
                    if st.button(nm, key=f"rt_br_{s0}_{idx}", use_container_width=True):
                        st.session_state["fo_ret_brand_id"] = str(h["id"])
                        st.session_state["fo_ret_brand_name"] = nm
                        st.session_state["fo_ret_style"] = ""
                        st.session_state["fo_ret_color"] = ""
                        st.session_state.pop(_KB_DLG, None)
                        st.session_state.pop(_KB_PG, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="rt_br_close"):
            st.session_state.pop(_KB_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < n and st.button("다음", key="rt_br_next"):
            st.session_state[_KB_PG] = pg + 1
            st.rerun()


@st.dialog("제품번호 선택")
def _ret_pick_style() -> None:
    bid = st.session_state.get("fo_ret_brand_id")
    if not bid:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="rt_st_close_e"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(sb, str(bid))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다.")
        if st.button("닫기", key="rt_st_close_n"):
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
                if st.button(sc, key=f"rt_st_{s0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_ret_style"] = sc
                    st.session_state["fo_ret_color"] = ""
                    st.session_state.pop(_KS_DLG, None)
                    st.session_state.pop(_KS_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="rt_st_close"):
            st.session_state.pop(_KS_DLG, None)
            st.rerun()
    with nr:
        if s0 + ps < len(styles) and st.button("다음", key="rt_st_next"):
            st.session_state[_KS_PG] = pg + 1
            st.rerun()


@st.dialog("칼라 선택")
def _ret_pick_color() -> None:
    bid = st.session_state.get("fo_ret_brand_id")
    stv = (st.session_state.get("fo_ret_style") or "").strip()
    if not bid or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="rt_co_close_e"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(sb, str(bid), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="rt_co_close_n"):
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
                if st.button(cc, key=f"rt_co_{c0}_{ri}_{j}", use_container_width=True):
                    st.session_state["fo_ret_color"] = cc
                    st.session_state.pop(_KC_DLG, None)
                    st.session_state.pop(_KC_PG, None)
                    st.rerun()
    nl, nr = st.columns([4, 1])
    with nl:
        if st.button("닫기", key="rt_co_close"):
            st.session_state.pop(_KC_DLG, None)
            st.rerun()
    with nr:
        if c0 + ps < len(colors) and st.button("다음", key="rt_co_next"):
            st.session_state[_KC_PG] = pg + 1
            st.rerun()


def _fmt_qty(v: float) -> str:
    return str(int(v)) if v == int(v) else f"{v:g}"

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("먼저 홈에서 지점을 등록하세요.")
    st.stop()

with st.container():
    h1, h2 = st.columns(2)
    with h1:
        store_labels = [f"{s['store_code']} — {s['name']}" for s in stores]
        sp = st.selectbox("지점", store_labels, index=default_store_index(stores))
        store_id = stores[store_labels.index(sp)]["id"]
    with h2:
        ret_day = st.date_input(
            "반품 일자",
            value=today_kst(),
            min_value=get_data_entry_start_date(),
            max_value=today_kst(),
            key="fo_ret_day",
            help="정산된 영업일에는 반품을 저장할 수 없습니다.",
        )

    suppliers = sb.table("fo_suppliers").select("id, name").execute().data or []
    sup_opts = ["(없음)"] + [x["name"] for x in suppliers]
    sup_map = {x["name"]: x["id"] for x in suppliers}
    sup_name = st.selectbox(
        "매입처",
        sup_opts,
        index=default_supplier_option_index(sup_opts),
        key="fo_ret_sup_sel",
    )
    selected_supplier_id = sup_map.get(sup_name) if sup_name != "(없음)" else None

ret_locked = is_business_day_settled(sb, store_id, ret_day)
if ret_locked:
    st.warning(settled_warning_message(ret_day))

if "fo_ret_cart" not in st.session_state:
    st.session_state.fo_ret_cart = []

ret_tab_code, ret_tab_pick = st.tabs(["상품코드/바코드", "브랜드·제품번호·칼라 선택"])

with ret_tab_code:
    st.session_state.setdefault("fo_ret_code_rev", 0)
    _rc_rev = st.session_state["fo_ret_code_rev"]
    _K_CODE_PROD = "fo_ret_code_product"

    _qty_key = f"rt_code_q_{_rc_rev}"
    _up_key = f"rt_code_up_{_rc_rev}"

    lk = st.text_input("상품코드/바코드", key=f"rt_code_lk_{_rc_rev}")
    if st.button("상품 검색", key=f"rt_code_search_{_rc_rev}"):
        p = find_product(sb, lk)
        if not p:
            st.session_state[_K_CODE_PROD] = None
            st.error("상품을 찾을 수 없습니다.")
        else:
            st.session_state[_K_CODE_PROD] = p
            st.session_state[_up_key] = int(p.get("cost_price") or 0)
            st.session_state[_qty_key] = 1
            st.rerun()

    _code_prod = st.session_state.get(_K_CODE_PROD)
    _default_cost = int(_code_prod.get("cost_price") or 0) if _code_prod else 0

    if _code_prod:
        st.success(f"선택: **{_code_prod['display_name']}** (`{_code_prod['product_code']}`) — 매입가 {_default_cost:,}원")

    q = st.number_input("반품 수량", min_value=1, value=1, step=1, key=_qty_key)
    up = st.number_input("단가 (매입가)", min_value=0, value=_default_cost, step=1000, key=_up_key)

    _code_subtotal = int(q) * int(up)
    st.caption(f"합계금액: **{_code_subtotal:,}원**")

    if st.button("행 추가", key=f"rt_code_add_{_rc_rev}", type="primary", disabled=_code_prod is None):
        if ret_locked:
            st.error("정산된 일자에는 반품을 추가할 수 없습니다.")
        elif _code_prod:
            st.session_state.fo_ret_cart.append(
                {
                    "product_id": _code_prod["id"],
                    "product_code": _code_prod["product_code"],
                    "display_name": _code_prod["display_name"],
                    "quantity": float(q),
                    "unit_price": int(up),
                    "is_damage_loss": False,
                }
            )
            st.session_state.pop(_K_CODE_PROD, None)
            st.session_state["fo_ret_code_rev"] = _rc_rev + 1
            st.rerun()

with ret_tab_pick:
    st.caption("POS 판매와 동일한 방식으로 상품을 선택합니다.")
    bc1, bc2, bc3 = st.columns(3)
    with bc1:
        st.text((st.session_state.get("fo_ret_brand_name") or "").strip() or "—")
        if st.button("브랜드 선택", key="rt_btn_brand"):
            st.session_state[_KB_DLG] = True
            st.session_state[_KB_PG] = 0
            st.rerun()
    with bc2:
        st.text((st.session_state.get("fo_ret_style") or "").strip() or "—")
        if st.button("제품번호 선택", key="rt_btn_style"):
            st.session_state[_KS_DLG] = True
            st.session_state[_KS_PG] = 0
            st.rerun()
    with bc3:
        st.text((st.session_state.get("fo_ret_color") or "").strip() or "—")
        if st.button("칼라 선택", key="rt_btn_color"):
            st.session_state[_KC_DLG] = True
            st.session_state[_KC_PG] = 0
            st.rerun()

    _bid = st.session_state.get("fo_ret_brand_id")
    _sty = (st.session_state.get("fo_ret_style") or "").strip()
    _col = (st.session_state.get("fo_ret_color") or "").strip()
    _pick_product = None

    _K_PICK_RESOLVED = "fo_ret_pick_resolved"
    st.session_state.setdefault(_K_PICK_RESOLVED, None)

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
            _cur_pid = str(_pick_product["id"])
            if st.session_state.get(_K_PICK_RESOLVED) != _cur_pid:
                st.session_state[_K_PICK_RESOLVED] = _cur_pid
                st.session_state["rt_pick_up"] = int(_pick_product.get("cost_price") or 0)
                st.session_state["rt_pick_qty"] = 1
                st.rerun()
            st.success(
                f"선택: **{_pick_product['display_name']}** (`{_pick_product['product_code']}`) "
                f"— 매입가 {int(_pick_product.get('cost_price') or 0):,}원"
            )
        else:
            st.warning("브랜드+제품번호+칼라 조합에 해당하는 상품이 없습니다.")

    pk_q = st.number_input("반품 수량", min_value=1, value=1, step=1, key="rt_pick_qty")
    pk_up = st.number_input(
        "단가 (매입가)", min_value=0,
        value=int(_pick_product.get("cost_price") or 0) if _pick_product else 0,
        step=1000, key="rt_pick_up",
    )
    _pk_subtotal = int(pk_q) * int(pk_up)
    st.caption(f"합계금액: **{_pk_subtotal:,}원**")

    if st.button("행 추가", key="rt_pick_add", type="primary", disabled=_pick_product is None):
        if ret_locked:
            st.error("정산된 일자에는 반품을 추가할 수 없습니다.")
        elif _pick_product:
            st.session_state.fo_ret_cart.append(
                {
                    "product_id": _pick_product["id"],
                    "product_code": _pick_product["product_code"],
                    "display_name": _pick_product["display_name"],
                    "quantity": float(pk_q),
                    "unit_price": int(pk_up),
                    "is_damage_loss": False,
                }
            )
            st.session_state["fo_ret_brand_id"] = ""
            st.session_state["fo_ret_brand_name"] = ""
            st.session_state["fo_ret_style"] = ""
            st.session_state["fo_ret_color"] = ""
            st.session_state.pop(_K_PICK_RESOLVED, None)
            st.rerun()

if st.session_state.get(_KB_DLG):
    _ret_pick_brand()
if st.session_state.get(_KS_DLG):
    _ret_pick_style()
if st.session_state.get(_KC_DLG):
    _ret_pick_color()

if st.session_state.fo_ret_cart:
    for i, line in enumerate(st.session_state.fo_ret_cart):
        c0, c1 = st.columns([4, 1])
        with c0:
            line_total = int(line["quantity"] * line["unit_price"])
            st.write(
                f"{line['display_name']} × {_fmt_qty(line['quantity'])} "
                f"@ {line['unit_price']:,}원 = {line_total:,}원"
            )
        with c1:
            if st.button("제거", key=f"ret_rm_{i}"):
                st.session_state.fo_ret_cart.pop(i)
                st.rerun()

    _total_amount = sum(int(ln["quantity"] * ln["unit_price"]) for ln in st.session_state.fo_ret_cart)
    _total_qty = sum(ln["quantity"] for ln in st.session_state.fo_ret_cart)
    st.metric("합계", f"{_total_amount:,}원 ({_fmt_qty(_total_qty)}개)")

    note = st.text_area("비고")
    if st.button("반품 저장", type="primary"):
        if ret_locked:
            st.error("정산된 일자에는 반품을 저장할 수 없습니다.")
        else:
            rid = str(uuid.uuid4())
            ret_ts = now_kst_iso() if ret_day == today_kst() else business_date_to_timestamptz(ret_day)
            try:
                sb.table("fo_returns").insert(
                    {
                        "id": rid,
                        "store_id": store_id,
                        "original_sale_id": None,
                        "returned_at": ret_ts,
                        "note": (note or "").strip() or None,
                    }
                ).execute()
                for line in st.session_state.fo_ret_cart:
                    sb.table("fo_return_lines").insert(
                        {
                            "return_id": rid,
                            "product_id": line["product_id"],
                            "quantity": line["quantity"],
                            "unit_price": line["unit_price"],
                            "is_damage_loss": line["is_damage_loss"],
                        }
                    ).execute()
                    bump_stock(sb, store_id, line["product_id"], -float(line["quantity"]))
                st.session_state.fo_ret_cart = []
                st.success("저장되었습니다.")
                st.rerun()
            except Exception as ex:
                st.error(f"저장 실패: {ex}")

st.subheader("반품 이력")
_sup_disp = f"매입처: **{sup_name}**" if selected_supplier_id else "매입처: (전체)"
st.caption(f"{_sup_disp} · **{ret_day.isoformat()}** 당일 처리한 반품 리스트")

import pandas as pd  # noqa: E402
from lib.constants import kst_day_range_utc_iso  # noqa: E402
from datetime import timedelta as _td  # noqa: E402

_ret_lo, _ = kst_day_range_utc_iso(ret_day)
_, _ret_hi = kst_day_range_utc_iso(ret_day + _td(days=1))

_today_returns = (
    sb.table("fo_returns")
    .select("id,returned_at,note")
    .eq("store_id", store_id)
    .gte("returned_at", _ret_lo)
    .lt("returned_at", _ret_hi)
    .order("returned_at", desc=True)
    .limit(200)
    .execute()
    .data or []
)

_sup_map_by_id = {str(s["id"]): s["name"] for s in suppliers}
_hist_rows = []
_hist_total = 0

for rrow in _today_returns:
    _lines = (
        sb.table("fo_return_lines")
        .select("product_id,quantity,unit_price")
        .eq("return_id", rrow["id"])
        .execute()
        .data or []
    )
    if not _lines:
        continue
    _pids = list({str(ln["product_id"]) for ln in _lines})
    _pmap: dict[str, dict] = {}
    if _pids:
        for _row in (
            sb.table("fo_products")
            .select("id,product_code,display_name,brand_id,style_code,color_code,cost_price,supplier_id")
            .in_("id", _pids)
            .execute()
            .data or []
        ):
            _pmap[str(_row["id"])] = _row

    _brand_map: dict[str, str] = {}
    _brand_ids = list({str(p.get("brand_id") or "") for p in _pmap.values() if p.get("brand_id")})
    if _brand_ids:
        for _br in (
            sb.table("fo_brands")
            .select("id,name")
            .in_("id", _brand_ids)
            .execute()
            .data or []
        ):
            _brand_map[str(_br["id"])] = str(_br.get("name") or "")

    for ln in _lines:
        pr = _pmap.get(str(ln["product_id"]), {})
        if selected_supplier_id and str(pr.get("supplier_id") or "") != str(selected_supplier_id):
            continue
        qty = float(ln["quantity"])
        up = int(ln["unit_price"] or 0)
        subtotal = int(qty * up)
        _hist_total += subtotal
        _hist_rows.append({
            "매입처": _sup_map_by_id.get(str(pr.get("supplier_id") or ""), ""),
            "브랜드": _brand_map.get(str(pr.get("brand_id") or ""), ""),
            "제품번호": pr.get("style_code") or "",
            "칼라": pr.get("color_code") or "",
            "수량": _fmt_qty(qty),
            "매입가": f"{up:,}",
            "반품합계": f"{subtotal:,}",
        })

if _hist_rows:
    st.dataframe(pd.DataFrame(_hist_rows), hide_index=True, use_container_width=True)
    st.metric("당일 반품 합계", f"{_hist_total:,}원")
else:
    st.info("당일 반품 이력이 없습니다.")
