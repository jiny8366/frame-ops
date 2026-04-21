"""POS 판매 — fo_sales / fo_sale_lines / fo_stock (온라인 전제 MVP)"""

from __future__ import annotations

import html
import os
import sys
import uuid
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="POS 판매 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.constants import (
    business_date_to_timestamptz,
    now_kst_iso,
    today_kst,
)
from lib.barcode_decode import decode_barcode_from_bytes, is_barcode_decode_available
from lib.pos_staff_auth import verify_clerk_for_pos_sale
from lib.sales_helpers import format_pos_keypad_amount_display
from lib.settlement_guard import is_business_day_settled, settled_warning_message
from lib.stock import bump_stock, find_product
from lib.store_defaults import default_store_index
from lib.fo_product_pick_utils import (
    brand_grid_cols,
    brand_page_size,
    load_all_brands,
    load_distinct_color_codes,
    load_distinct_style_codes,
)
from lib.sales_search_panel import render_sales_search_panel
from lib.streamlit_fo_stores import active_fo_stores_list_or_halt
from lib.supabase_client import get_configured_supabase_anon_key, get_supabase

K_PENDING_SALE_SAVE = "fo_pending_sale_save"
K_OPEN_SALE_SEARCH = "fo_pos_sale_search_open"
K_POS_BR_DLG = "fo_pos_brand_dlg_open"
K_POS_BR_PG = "fo_pos_brand_dlg_page"
K_POS_ST_DLG = "fo_pos_style_dlg_open"
K_POS_ST_PG = "fo_pos_style_dlg_page"
K_POS_CO_DLG = "fo_pos_color_dlg_open"
K_POS_CO_PG = "fo_pos_color_dlg_page"
DEFAULT_CLERK_EMAIL = os.getenv("FO_POS_CLERK_EMAIL", "").strip()

FO_POS_KPD_CSS = """
<style>
.fo-pos-keypad-lcd-wrap { margin-bottom: 0.35rem; }
.fo-pos-keypad-lcd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: clamp(1.15rem, 3.2vw, 1.65rem);
  font-weight: 700;
  text-align: right;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}
.fo-pos-keypad-lcd-won { margin-left: 0.3rem; font-size: 0.88em; opacity: 0.88; }
.st-key-fo_pos_amt_keypad_scope [data-testid="stButton"] > button {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  min-height: 0 !important;
  max-height: none !important;
  font-size: clamp(1.05rem, 2.2vw, 1.45rem) !important;
  font-weight: 650 !important;
  padding: 0.2rem 0.45rem !important;
}
</style>
"""

header_title, header_search, header_store, header_day = st.columns([2, 1, 2, 2])
with header_title:
    st.title("POS 판매")
if not get_configured_supabase_anon_key():
    st.warning(
        "**판매 저장** 시 담당자 비밀번호 확인을 위해 `SUPABASE_ANON_KEY`(또는 anon `SUPABASE_KEY`)가 필요합니다. "
        "Supabase 대시보드 → Project Settings → API 의 **anon public** 키를 `.env` / secrets 에 추가하세요."
    )

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("홈에서 지점을 먼저 등록하거나 「데모 데이터 넣기」를 실행하세요.")
    st.stop()


@st.dialog("브랜드 선택")
def pos_pick_brand_dialog() -> None:
    brands = load_all_brands(sb)
    if not brands:
        st.warning("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="fo_pos_br_dlg_close_empty"):
            st.session_state.pop(K_POS_BR_DLG, None)
            st.rerun()
        return
    n = len(brands)
    page_size = brand_page_size(n)
    page = int(st.session_state.get(K_POS_BR_PG, 0))
    start = page * page_size
    chunk = brands[start : start + page_size]
    cols_n = brand_grid_cols(page_size)
    n_rows = (page_size + cols_n - 1) // cols_n
    idx = 0
    for _r in range(n_rows):
        cols = st.columns(cols_n)
        for c in range(cols_n):
            with cols[c]:
                if idx < len(chunk):
                    h = chunk[idx]
                    nm = str(h.get("name") or "")
                    if st.button(nm, key=f"fo_pos_br_dlg_{start}_{idx}", use_container_width=True):
                        st.session_state["fo_pos_brand_id"] = str(h["id"])
                        st.session_state["fo_pos_brand_name"] = nm
                        st.session_state["fo_pos_style"] = ""
                        st.session_state["fo_pos_color"] = ""
                        st.session_state.pop(K_POS_BR_DLG, None)
                        st.session_state.pop(K_POS_BR_PG, None)
                        st.rerun()
                else:
                    st.empty()
                idx += 1
    nav_l, nav_r = st.columns([4, 1])
    with nav_l:
        if st.button("닫기", key="fo_pos_br_dlg_close"):
            st.session_state.pop(K_POS_BR_DLG, None)
            st.rerun()
    with nav_r:
        if start + page_size < n:
            if st.button("다음", key="fo_pos_br_dlg_next"):
                st.session_state[K_POS_BR_PG] = page + 1
                st.rerun()


@st.dialog("제품번호 선택")
def pos_pick_style_dialog() -> None:
    bid_s = st.session_state.get("fo_pos_brand_id")
    if not bid_s:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="fo_pos_st_dlg_close_err"):
            st.session_state.pop(K_POS_ST_DLG, None)
            st.rerun()
        return
    styles = load_distinct_style_codes(sb, str(bid_s))
    if not styles:
        st.info("이 브랜드에 등록된 제품번호가 없습니다. 상품을 먼저 등록하세요.")
        if st.button("닫기", key="fo_pos_st_dlg_close_none"):
            st.session_state.pop(K_POS_ST_DLG, None)
            st.rerun()
        return
    page_sz = 15
    pg = int(st.session_state.get(K_POS_ST_PG, 0))
    st0 = pg * page_sz
    page_styles = styles[st0 : st0 + page_sz]
    st.caption(f"총 **{len(styles)}**개 · {pg + 1}페이지")
    n_cols = 5
    for row_i in range(0, len(page_styles), n_cols):
        row_items = page_styles[row_i : row_i + n_cols]
        cols = st.columns(n_cols)
        for j, sc in enumerate(row_items):
            with cols[j]:
                if st.button(sc, key=f"fo_pos_st_dlg_{st0}_{row_i}_{j}", use_container_width=True):
                    st.session_state["fo_pos_style"] = sc
                    st.session_state["fo_pos_color"] = ""
                    st.session_state.pop(K_POS_ST_DLG, None)
                    st.session_state.pop(K_POS_ST_PG, None)
                    st.rerun()
    nav_sl, nav_sr = st.columns([4, 1])
    with nav_sl:
        if st.button("닫기", key="fo_pos_st_dlg_close"):
            st.session_state.pop(K_POS_ST_DLG, None)
            st.rerun()
    with nav_sr:
        if st0 + page_sz < len(styles):
            if st.button("다음", key="fo_pos_st_dlg_next"):
                st.session_state[K_POS_ST_PG] = pg + 1
                st.rerun()


@st.dialog("칼라 선택")
def pos_pick_color_dialog() -> None:
    bid_c = st.session_state.get("fo_pos_brand_id")
    stv = (st.session_state.get("fo_pos_style") or "").strip()
    if not bid_c or not stv:
        st.error("브랜드와 제품번호를 먼저 선택하세요.")
        if st.button("닫기", key="fo_pos_co_dlg_close_err"):
            st.session_state.pop(K_POS_CO_DLG, None)
            st.rerun()
        return
    colors = load_distinct_color_codes(sb, str(bid_c), stv)
    if not colors:
        st.info("해당 제품번호에 등록된 칼라가 없습니다.")
        if st.button("닫기", key="fo_pos_co_dlg_close_none"):
            st.session_state.pop(K_POS_CO_DLG, None)
            st.rerun()
        return
    page_sz = 6
    pg = int(st.session_state.get(K_POS_CO_PG, 0))
    c0 = pg * page_sz
    page_colors = colors[c0 : c0 + page_sz]
    st.caption(f"총 **{len(colors)}**개 · {pg + 1}페이지")
    n_cols = 3
    for row_i in range(0, len(page_colors), n_cols):
        row_items = page_colors[row_i : row_i + n_cols]
        cols = st.columns(n_cols)
        for j, cc in enumerate(row_items):
            with cols[j]:
                if st.button(cc, key=f"fo_pos_co_dlg_{c0}_{row_i}_{j}", use_container_width=True):
                    st.session_state["fo_pos_color"] = cc
                    st.session_state.pop(K_POS_CO_DLG, None)
                    st.session_state.pop(K_POS_CO_PG, None)
                    st.rerun()
    nav_cl, nav_cr = st.columns([4, 1])
    with nav_cl:
        if st.button("닫기", key="fo_pos_co_dlg_close"):
            st.session_state.pop(K_POS_CO_DLG, None)
            st.rerun()
    with nav_cr:
        if c0 + page_sz < len(colors):
            if st.button("다음", key="fo_pos_co_dlg_next"):
                st.session_state[K_POS_CO_PG] = pg + 1
                st.rerun()


def _render_amount_keypad(field_key: str, label: str) -> int:
    """금액은 팝오버 키패드에서만 편집하고, **적용** 시 메인 입력창에 반영 (@st.fragment 로 키 입력 시 전체 리런 최소화)."""
    current = int(st.session_state.get(field_key, 0) or 0)
    draft_key = f"{field_key}_draft"
    if draft_key not in st.session_state:
        st.session_state[draft_key] = str(current) if current else ""

    show_col, pop_col = st.columns([3, 1])
    with show_col:
        st.text_input(label, value=f"{current:,}", disabled=True)
    with pop_col:
        st.write("")
        with st.popover("입력", help=f"{label} — 숫자 입력 후 **적용**"):
            _render_amount_keypad_fragment(field_key, draft_key, label)

    return int(st.session_state.get(field_key, 0) or 0)


@st.fragment
def _render_amount_keypad_fragment(field_key: str, draft_key: str, label_display: str) -> None:
    with st.container(key="fo_pos_amt_keypad_scope"):
        draft = st.session_state.get(draft_key) or ""
        lcd = format_pos_keypad_amount_display(draft)
        st.markdown(
            f"""
<div class="fo-pos-keypad-lcd-wrap">
  <div class="fo-pos-keypad-lcd">{html.escape(lcd)}<span class="fo-pos-keypad-lcd-won">원</span></div>
</div>
""",
            unsafe_allow_html=True,
        )

        def _append(s: str) -> None:
            st.session_state[draft_key] = (st.session_state.get(draft_key) or "") + s

        k1, k2, k3 = st.columns(3)
        with k1:
            if st.button("7", key=f"{field_key}_fr7", use_container_width=True):
                _append("7")
            if st.button("4", key=f"{field_key}_fr4", use_container_width=True):
                _append("4")
            if st.button("1", key=f"{field_key}_fr1", use_container_width=True):
                _append("1")
            if st.button("00", key=f"{field_key}_fr00", use_container_width=True):
                _append("00")
        with k2:
            if st.button("8", key=f"{field_key}_fr8", use_container_width=True):
                _append("8")
            if st.button("5", key=f"{field_key}_fr5", use_container_width=True):
                _append("5")
            if st.button("2", key=f"{field_key}_fr2", use_container_width=True):
                _append("2")
            if st.button("0", key=f"{field_key}_fr0", use_container_width=True):
                _append("0")
        with k3:
            if st.button("9", key=f"{field_key}_fr9", use_container_width=True):
                _append("9")
            if st.button("6", key=f"{field_key}_fr6", use_container_width=True):
                _append("6")
            if st.button("3", key=f"{field_key}_fr3", use_container_width=True):
                _append("3")
            if st.button("⌫", key=f"{field_key}_frbs", use_container_width=True, help="한 자리 삭제"):
                st.session_state[draft_key] = (st.session_state.get(draft_key) or "")[:-1]

        a1, a2 = st.columns(2)
        with a1:
            if st.button("초기화", key=f"{field_key}_frclr", use_container_width=True):
                st.session_state[draft_key] = ""
        with a2:
            if st.button("적용", key=f"{field_key}_frapply", type="primary", use_container_width=True):
                raw = "".join(ch for ch in (st.session_state.get(draft_key) or "") if ch.isdigit())
                st.session_state[field_key] = int(raw or "0")
                st.session_state[draft_key] = str(st.session_state[field_key])


def _run_sale_save(
    *,
    sb,
    store_id: str,
    sale_day,
    cart: list[dict],
    cash: int,
    card: int,
    disc: int,
    dtype_code: str | None,
    clerk_email: str,
    clerk_password: str,
) -> None:
    seller_uid, seller_label, seller_code = verify_clerk_for_pos_sale(
        sb,
        email=clerk_email,
        password=clerk_password,
        store_id=str(store_id),
    )

    sale_id = str(uuid.uuid4())
    idem = str(uuid.uuid4())
    if sale_day == today_kst():
        sold_at = now_kst_iso()
    else:
        sold_at = business_date_to_timestamptz(sale_day)

    row_ins = {
        "id": sale_id,
        "store_id": store_id,
        "sold_at": sold_at,
        "cash_amount": int(cash),
        "card_amount": int(card),
        "discount_total": int(disc),
        "discount_type_code": dtype_code,
        "idempotency_key": idem,
        "seller_code": seller_code,
        "seller_user_id": seller_uid,
        "seller_label": seller_label,
    }
    sb.table("fo_sales").insert(row_ins).execute()

    for line in cart:
        sb.table("fo_sale_lines").insert(
            {
                "sale_id": sale_id,
                "product_id": line["product_id"],
                "quantity": line["quantity"],
                "unit_price": line["unit_price"],
                "line_discount": 0,
                "cost_price_at_sale": line["cost_price"],
            }
        ).execute()
        bump_stock(sb, store_id, line["product_id"], -float(line["quantity"]))

    st.session_state.fo_cart = []
    st.session_state.pop("fo_cash_warn_ok", None)
    st.session_state.pop(K_PENDING_SALE_SAVE, None)
    st.success(f"저장 완료 · 전표 `{sale_id[:8]}…` · 담당자 반영됨")
    st.balloons()
    st.rerun()

store_idx = default_store_index(stores)
store_obj = stores[store_idx]
store_label = f"{store_obj['store_code']} — {store_obj['name']}"
store_id = store_obj["id"]
sale_day = today_kst()

with header_search:
    st.write("")
    if st.button("판매 검색", key="fo_pos_open_sale_search"):
        st.session_state[K_OPEN_SALE_SEARCH] = True
        st.rerun()
with header_store:
    st.text_input("점명", value=store_label, disabled=True)
with header_day:
    st.date_input("판매일자", value=sale_day, disabled=True)

if st.session_state.get(K_OPEN_SALE_SEARCH):

    @st.dialog("판매 검색")
    def _sale_search_dialog() -> None:
        render_sales_search_panel(
            sb,
            fixed_store_id=str(store_id),
            fixed_store_label=store_label,
            key_prefix="fo_pos_sale_search",
        )
        if st.button("닫기", key="fo_pos_sale_search_close"):
            st.session_state.pop(K_OPEN_SALE_SEARCH, None)
            st.rerun()

    _sale_search_dialog()

pos_locked = is_business_day_settled(sb, store_id, sale_day)
if pos_locked:
    st.warning(settled_warning_message(sale_day))

if "fo_cart" not in st.session_state:
    st.session_state.fo_cart = []

left, right = st.columns((5, 7), gap="large")

with left:
    st.markdown("##### 상품 담기")
    with st.expander("카메라 스캔", expanded=False):
        st.caption(
            "브라우저에서 **카메라 권한**이 필요합니다. 배포 시 **HTTPS**(또는 PC에서 localhost)에서만 "
            "모바일 카메라가 동작하는 경우가 많습니다. 선명하게 찍은 뒤 아래 버튼을 누르세요."
        )
        st.caption(
            "블루투스/무선 **바코드 스캐너**는 키보드처럼 동작하므로, 이 칸 없이 아래 입력란에 포커스를 두고 스캔만 해도 됩니다."
        )
        if not is_barcode_decode_available():
            st.warning(
                "카메라 인식을 쓰려면 `opencv-python-headless`가 필요합니다. "
                "`pip install -r requirements.txt` 후 앱을 다시 실행하세요."
            )
        cam = st.camera_input("바코드 영역이 잘 보이게 촬영", key="fo_pos_barcode_cam", label_visibility="collapsed")
        if cam is not None and st.button("이 사진에서 코드 읽기", key="fo_pos_barcode_decode"):
            if not is_barcode_decode_available():
                st.error("OpenCV가 설치되어 있지 않습니다.")
            else:
                raw = decode_barcode_from_bytes(cam.getvalue())
                if raw is None:
                    st.error("이미지에서 바코드·QR을 읽지 못했습니다. 밝기·거리·각도를 조절해 다시 촬영해 보세요.")
                else:
                    st.session_state["fo_lookup"] = raw
                    st.success(f"인식됨: **{raw}** — 수량 확인 후 「장바구니에 담기」를 누르세요.")
                    st.rerun()

    lookup = st.text_input("바코드 스캔", key="fo_lookup")
    st.session_state.setdefault("fo_pos_brand_id", None)
    st.session_state.setdefault("fo_pos_brand_name", "")
    st.session_state.setdefault("fo_pos_style", "")
    st.session_state.setdefault("fo_pos_color", "")

    bc1, bc2, bc3 = st.columns(3)
    with bc1:
        st.caption("브랜드")
        st.text((st.session_state.get("fo_pos_brand_name") or "").strip() or "—")
        if st.button("브랜드 선택", key="fo_pos_btn_brand"):
            st.session_state[K_POS_BR_DLG] = True
            st.session_state[K_POS_BR_PG] = 0
            st.rerun()
    with bc2:
        st.caption("제품번호")
        st.text((st.session_state.get("fo_pos_style") or "").strip() or "—")
        if st.button(
            "제품번호 선택",
            key="fo_pos_btn_style",
            disabled=not st.session_state.get("fo_pos_brand_id"),
        ):
            st.session_state[K_POS_ST_DLG] = True
            st.session_state[K_POS_ST_PG] = 0
            st.rerun()
    with bc3:
        st.caption("칼라")
        st.text((st.session_state.get("fo_pos_color") or "").strip() or "—")
        bid_c = st.session_state.get("fo_pos_brand_id")
        st_ok = bool((st.session_state.get("fo_pos_style") or "").strip())
        if st.button("칼라 선택", key="fo_pos_btn_color", disabled=not (bid_c and st_ok)):
            st.session_state[K_POS_CO_DLG] = True
            st.session_state[K_POS_CO_PG] = 0
            st.rerun()

    bid = st.session_state.get("fo_pos_brand_id")
    sty = (st.session_state.get("fo_pos_style") or "").strip()
    col = (st.session_state.get("fo_pos_color") or "").strip()
    selected_product_row = None
    if bid and sty and col:
        pr = (
            sb.table("fo_products")
            .select("id, product_code, display_name, style_code, color_code, sale_price, cost_price")
            .eq("brand_id", str(bid))
            .eq("style_code", sty)
            .eq("color_code", col)
            .limit(1)
            .execute()
            .data
            or []
        )
        selected_product_row = pr[0] if pr else None

    qty_add = st.number_input("수량", min_value=0.01, value=1.0, step=1.0)
    if st.button("장바구니에 담기", use_container_width=True):
        if pos_locked:
            st.error("정산된 일자에는 담을 수 없습니다.")
        else:
            p = selected_product_row
            if not p and (lookup or "").strip():
                p = find_product(sb, lookup)
            if not p:
                st.error("상품을 찾을 수 없습니다.")
            else:
                st.session_state.fo_cart.append(
                    {
                        "product_id": p["id"],
                        "product_code": p["product_code"],
                        "display_name": p["display_name"],
                        "quantity": float(qty_add),
                        "unit_price": int(p["sale_price"]),
                        "cost_price": int(p["cost_price"]),
                    }
                )
                st.success("담았습니다.")
                st.rerun()

if st.session_state.get(K_POS_BR_DLG):
    pos_pick_brand_dialog()
if st.session_state.get(K_POS_ST_DLG):
    pos_pick_style_dialog()
if st.session_state.get(K_POS_CO_DLG):
    pos_pick_color_dialog()

with right:
    st.markdown(
        """
        <style>
        div[data-testid="stPopoverBody"] button {
            width: 100% !important;
            min-height: clamp(3.25rem, 11vw, 6rem) !important;
            font-size: clamp(1.25rem, 4.2vw, 2.35rem) !important;
            font-weight: 600 !important;
            padding-top: 0.65rem !important;
            padding-bottom: 0.65rem !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    st.markdown(FO_POS_KPD_CSS, unsafe_allow_html=True)
    st.markdown("##### 장바구니 · 결제")
    if not st.session_state.fo_cart:
        st.info("왼쪽에서 상품을 담으면 여기에 표시됩니다.")
    else:
        for i, line in enumerate(st.session_state.fo_cart):
            c0, c1, c2, c3 = st.columns([4, 1, 1, 1])
            with c0:
                st.write(f"**{line['display_name']}**  `{line['product_code']}`")
            with c1:
                st.write(f"{line['quantity']}개")
            with c2:
                st.write(f"{line['unit_price']:,}원")
            with c3:
                if st.button("삭제", key=f"rm_{i}"):
                    st.session_state.fo_cart.pop(i)
                    st.rerun()

        subtotal = sum(int(line["unit_price"] * line["quantity"]) for line in st.session_state.fo_cart)
        d1, d2 = st.columns(2)
        with d1:
            disc = _render_amount_keypad("fo_pos_disc", "할인 합계(원)")
        with d2:
            dtypes = (
                sb.table("fo_discount_types")
                .select("code, label")
                .eq("active", True)
                .order("sort_order")
                .execute()
                .data
                or []
            )
            dtype_labels = ["(선택 없음)"] + [f"{d['label']}" for d in dtypes]
            d_pick = st.selectbox("할인 유형", dtype_labels)
            dtype_code = None
            if d_pick != "(선택 없음)":
                idx = dtype_labels.index(d_pick) - 1
                dtype_code = dtypes[idx]["code"]

        total = max(0, subtotal - disc)
        st.metric("합계 (부가세 포함)", f"{total:,}원")

        st.markdown("##### 결제처리")
        p1, p2 = st.columns(2)
        with p1:
            card = _render_amount_keypad("fo_pos_card", "카드")
        with p2:
            cash = _render_amount_keypad("fo_pos_cash", "현금")

        if cash > 100_000:
            st.warning(
                "현금 10만 원 초과 — 현금영수증·자진발급 안내 확인 (실제 발행은 시스템 외)."
            )
            st.checkbox("위 내용을 확인했습니다.", key="fo_cash_warn_ok")

        pay_sum = int(cash) + int(card)
        if pay_sum != total and total > 0:
            st.error(f"현금+카드 **{pay_sum:,}원** ≠ 합계 **{total:,}원**")

        if st.button("저장", type="primary", use_container_width=True):
            if pos_locked:
                st.error("정산된 일자에는 저장할 수 없습니다.")
            elif cash > 100_000 and not st.session_state.get("fo_cash_warn_ok"):
                st.error("현금 초과 경고를 확인해 주세요.")
            elif total <= 0:
                st.error("합계가 0원 이하입니다.")
            elif pay_sum != total:
                st.error("결제 금액을 합계와 맞춰 주세요.")
            else:
                st.session_state[K_PENDING_SALE_SAVE] = {
                    "store_id": str(store_id),
                    "sale_day": sale_day.isoformat(),
                    "cash": int(cash),
                    "card": int(card),
                    "disc": int(disc),
                    "dtype_code": dtype_code,
                    "cart": list(st.session_state.fo_cart),
                }
                st.rerun()

pending_sale = st.session_state.get(K_PENDING_SALE_SAVE)
if pending_sale:
    @st.dialog("판매 담당자 본인 확인")
    def _confirm_sale_dialog() -> None:
        clerk_email = str(st.session_state.get("fo_pos_clerk_email") or DEFAULT_CLERK_EMAIL).strip()
        if not clerk_email:
            st.error("담당자 이메일 설정이 필요합니다. `.env`에 `FO_POS_CLERK_EMAIL`을 설정하세요.")
            if st.button("취소", key="fo_pos_save_cancel_no_email"):
                st.session_state.pop(K_PENDING_SALE_SAVE, None)
                st.rerun()
            return

        with st.form("fo_pos_confirm_form", clear_on_submit=False):
            clerk_password = st.text_input("담당자 비밀번호", type="password", key="fo_pos_clerk_pw_modal")
            b1, b2 = st.columns(2)
            with b1:
                cancel = st.form_submit_button("취소")
            with b2:
                submit = st.form_submit_button("확인 후 저장", type="primary")

        if cancel:
            st.session_state.pop(K_PENDING_SALE_SAVE, None)
            st.rerun()

        if submit:
            if not clerk_password:
                st.error("담당자 비밀번호를 입력하세요.")
            else:
                try:
                    _run_sale_save(
                        sb=sb,
                        store_id=str(pending_sale["store_id"]),
                        sale_day=sale_day,
                        cart=list(pending_sale["cart"]),
                        cash=int(pending_sale["cash"]),
                        card=int(pending_sale["card"]),
                        disc=int(pending_sale["disc"]),
                        dtype_code=pending_sale.get("dtype_code"),
                        clerk_email=clerk_email,
                        clerk_password=clerk_password,
                    )
                except (ValueError, RuntimeError) as ex:
                    st.error(str(ex))
                except Exception as ex:
                    err = str(ex)
                    if "seller_user_id" in err or "seller_label" in err or "column" in err.lower():
                        st.error(
                            "저장 실패: 담당자 식별 컬럼이 없을 수 있습니다. Supabase에 "
                            "`supabase/migrations/20260422_frame_ops_sales_seller_identity.sql` 을 실행한 뒤 다시 시도하세요.\n\n"
                            f"원문: {ex}"
                        )
                    elif "seller_code" in err:
                        st.error(
                            "저장 실패: `seller_code` 컬럼 없음. `20260417_frame_ops_analytics.sql` 적용 여부를 확인하세요."
                        )
                    else:
                        st.error(f"저장 실패: {ex}")
    _confirm_sale_dialog()
