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
from lib.pos_staff_auth import verify_clerk_by_pin
from lib.staff_rbac import list_pos_clerks_for_store
from lib.sales_helpers import format_fo_quantity_display, format_pos_keypad_amount_display
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
from lib.supabase_client import get_configured_supabase_anon_key, get_configured_supabase_url, get_supabase


@st.cache_data(ttl=300, show_spinner=False)
def _cached_product_by_bsc(supabase_url: str, brand_id: str, style: str, color: str):
    """브랜드+스타일+색상으로 제품 조회 — 5분 캐싱."""
    from lib.supabase_client import get_supabase as _gsb
    _sb = _gsb()
    pr = (
        _sb.table("fo_products")
        .select("id, product_code, display_name, style_code, color_code, sale_price, cost_price")
        .eq("brand_id", str(brand_id))
        .eq("style_code", style)
        .eq("color_code", color)
        .limit(1)
        .execute()
        .data
        or []
    )
    return pr[0] if pr else None


@st.cache_data(ttl=300, show_spinner=False)
def _cached_discount_types(supabase_url: str) -> list:
    """할인유형 목록 — 5분 캐싱."""
    from lib.supabase_client import get_supabase as _gsb
    _sb = _gsb()
    return (
        _sb.table("fo_discount_types")
        .select("code, label")
        .eq("active", True)
        .order("sort_order")
        .execute()
        .data
        or []
    )

K_PENDING_SALE_SAVE = "fo_pending_sale_save"
K_OPEN_SALE_SEARCH = "fo_pos_sale_search_open"
K_POS_BR_DLG = "fo_pos_brand_dlg_open"
K_POS_BR_PG = "fo_pos_brand_dlg_page"
K_POS_ST_DLG = "fo_pos_style_dlg_open"
K_POS_ST_PG = "fo_pos_style_dlg_page"
K_POS_CO_DLG = "fo_pos_color_dlg_open"
K_POS_CO_PG = "fo_pos_color_dlg_page"
DEFAULT_CLERK_EMAIL = os.getenv("FO_POS_CLERK_EMAIL", "").strip()
FO_POS_ACTIVE_AMOUNT_KEYPAD = "fo_pos_active_amount_keypad_field"
FO_POS_KPD_DLG_TOP_PX = 100
FO_POS_KPD_DLG_RIGHT_PX = 100

FO_POS_KPD_CSS = """
<style>
.fo-pos-keypad-lcd-wrap { margin-bottom: 0.35rem; }
.fo-pos-keypad-lcd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.5rem;
  font-weight: 700;
  text-align: right;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
}
.fo-pos-keypad-lcd-won { margin-left: 0.3rem; font-size: 0.88em; opacity: 0.88; }
[class*="st-key-fo_pos_amt_keypad_scope_"] {
  --fo-kpd-side: 68px;
  width: 236px;
  min-width: 236px;
  max-width: 236px;
  margin-left: auto;
  margin-right: auto;
  border: 5px solid #ffffff;
  border-radius: 12px;
  padding: 8px;
  box-sizing: border-box;
}
[class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stButton"] > button {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  height: var(--fo-kpd-side) !important;
  min-height: var(--fo-kpd-side) !important;
  max-height: var(--fo-kpd-side) !important;
  font-size: 1.2rem !important;
  font-weight: 650 !important;
  padding: 0.2rem 0.45rem !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* ⌫ 버튼은 라벨/렌더 차이로 높이가 달라질 수 있어 별도 강제 */
[class*="st-key-"][class*="_frbs"] [data-testid="stButton"] > button {
  aspect-ratio: 1 / 1 !important;
  height: var(--fo-kpd-side) !important;
  min-height: var(--fo-kpd-side) !important;
  max-height: var(--fo-kpd-side) !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* 삭제 버튼 전용 래퍼: 높이/폭을 숫자키와 동일하게 강제 */
[class*="st-key-"][class*="_pad_bs"] [data-testid="stButton"] > button {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  height: var(--fo-kpd-side) !important;
  min-height: var(--fo-kpd-side) !important;
  max-height: var(--fo-kpd-side) !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* 금액입력 다이얼로그: 화면 우측 상단 고정 (top 100px, right 100px) */
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) {
  position: fixed !important;
  top: __FO_POS_KPD_DLG_TOP_PX__px !important;
  right: __FO_POS_KPD_DLG_RIGHT_PX__px !important;
  left: auto !important;
  bottom: auto !important;
  transform: none !important;
  margin: 0 !important;
  width: 280px !important;
  min-width: 280px !important;
  max-width: 280px !important;
}
/* 상/하 여백 제거 */
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) > div,
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"],
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="document"] {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]),
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) > div,
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"],
[data-baseweb="modal"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="document"] {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
</style>
""".replace("__FO_POS_KPD_DLG_TOP_PX__", str(FO_POS_KPD_DLG_TOP_PX)).replace(
    "__FO_POS_KPD_DLG_RIGHT_PX__", str(FO_POS_KPD_DLG_RIGHT_PX)
)

header_title, header_search, header_store, header_day = st.columns([2, 1, 2, 2])
with header_title:
    st.title("POS 판매")

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
    """금액은 우측상단 다이얼로그 키패드에서만 편집하고, 적용 시 메인 입력창 반영."""
    current = int(st.session_state.get(field_key, 0) or 0)
    draft_key = f"{field_key}_draft"
    if draft_key not in st.session_state:
        st.session_state[draft_key] = str(current) if current else ""

    show_col, pop_col = st.columns([3, 1])
    with show_col:
        st.text_input(label, value=f"{current:,}", disabled=True)
    with pop_col:
        st.write("")
        if st.button("입력", key=f"{field_key}_open_amount_kp", use_container_width=True):
            st.session_state[FO_POS_ACTIVE_AMOUNT_KEYPAD] = field_key
            cur = int(st.session_state.get(field_key, 0) or 0)
            st.session_state[draft_key] = str(cur) if cur else ""

    other_dialog_open = any(
        bool(st.session_state.get(k))
        for k in (
            K_POS_BR_DLG,
            K_POS_ST_DLG,
            K_POS_CO_DLG,
            K_OPEN_SALE_SEARCH,
        )
    )
    if st.session_state.get(FO_POS_ACTIVE_AMOUNT_KEYPAD) == field_key and not other_dialog_open:
        if field_key == "fo_pos_card":
            _dialog_fo_pos_card_amount()
        elif field_key == "fo_pos_cash":
            _dialog_fo_pos_cash_amount()
        elif field_key == "fo_pos_disc":
            _dialog_fo_pos_disc_amount()

    return int(st.session_state.get(field_key, 0) or 0)


@st.fragment
def _render_amount_keypad_fragment(field_key: str, draft_key: str, label_display: str) -> None:
    with st.container(key=f"fo_pos_amt_keypad_scope_{field_key}"):
        lcd_slot = st.empty()

        def _render_lcd() -> None:
            draft = st.session_state.get(draft_key) or ""
            lcd = format_pos_keypad_amount_display(draft)
            lcd_slot.markdown(
                f"""
<div class="fo-pos-keypad-lcd-wrap">
  <div class="fo-pos-keypad-lcd">{html.escape(lcd)}<span class="fo-pos-keypad-lcd-won">원</span></div>
</div>
""",
                unsafe_allow_html=True,
            )

        # 상단 고정 표시 (버튼 처리 전 1회)
        _render_lcd()

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
            with st.container(key=f"{field_key}_pad_bs"):
                if st.button("삭제", key=f"{field_key}_frbs", use_container_width=True):
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
                st.session_state.pop(FO_POS_ACTIVE_AMOUNT_KEYPAD, None)
                st.rerun()

        # 버튼 처리 이후 상태로 상단 LCD를 즉시 갱신
        _render_lcd()


@st.dialog("카드 금액 입력", width="small")
def _dialog_fo_pos_card_amount() -> None:
    _render_amount_keypad_fragment("fo_pos_card", "fo_pos_card_draft", "카드")


@st.dialog("현금 금액 입력", width="small")
def _dialog_fo_pos_cash_amount() -> None:
    _render_amount_keypad_fragment("fo_pos_cash", "fo_pos_cash_draft", "현금")


@st.dialog("할인 합계 입력", width="small")
def _dialog_fo_pos_disc_amount() -> None:
    _render_amount_keypad_fragment("fo_pos_disc", "fo_pos_disc_draft", "할인 합계(원)")


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
    clerk_user_id: str,
    clerk_pin: str,
) -> None:
    seller_uid, seller_label, seller_code = verify_clerk_by_pin(
        sb,
        user_id=clerk_user_id,
        pin=clerk_pin,
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
        selected_product_row = _cached_product_by_bsc(get_configured_supabase_url(), str(bid), sty, col)

    qty_add = st.number_input("수량", min_value=1, value=1, step=1)
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
                        "quantity": int(qty_add),
                        "unit_price": int(p["sale_price"]),
                        "cost_price": int(p["cost_price"]),
                    }
                )
                st.success("담았습니다.")
                st.rerun()

if st.session_state.get(K_POS_BR_DLG):
    st.session_state.pop(FO_POS_ACTIVE_AMOUNT_KEYPAD, None)
    pos_pick_brand_dialog()
if st.session_state.get(K_POS_ST_DLG):
    st.session_state.pop(FO_POS_ACTIVE_AMOUNT_KEYPAD, None)
    pos_pick_style_dialog()
if st.session_state.get(K_POS_CO_DLG):
    st.session_state.pop(FO_POS_ACTIVE_AMOUNT_KEYPAD, None)
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
            c0, cm, cq, cp, c2, c3 = st.columns([4, 1, 1, 1, 2, 1])
            with c0:
                st.write(f"**{line['display_name']}**")
            with cm:
                if st.button("－", key=f"qty_dn_{i}", use_container_width=True):
                    if st.session_state.fo_cart[i]["quantity"] > 1:
                        st.session_state.fo_cart[i]["quantity"] -= 1
                    st.rerun()
            with cq:
                st.write(f"**{format_fo_quantity_display(line['quantity'])}**")
            with cp:
                if st.button("＋", key=f"qty_up_{i}", use_container_width=True):
                    st.session_state.fo_cart[i]["quantity"] += 1
                    st.rerun()
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
            dtypes = _cached_discount_types(get_configured_supabase_url())
            dtype_labels = ["(선택 없음)"] + [f"{d['label']}" for d in dtypes]
            d_pick = st.selectbox("할인 유형", dtype_labels)
            dtype_code = None
            if d_pick != "(선택 없음)":
                idx = dtype_labels.index(d_pick) - 1
                dtype_code = dtypes[idx]["code"]

        total = max(0, subtotal - disc)
        st.metric("합계 (부가세 포함)", f"{total:,}원")

        st.markdown("##### 결제처리")
        qb1, qb2, qb3 = st.columns(3)
        with qb1:
            if st.button("카드 전액", key="fo_pos_full_card", use_container_width=True):
                st.session_state["fo_pos_card"] = total
                st.session_state["fo_pos_card_draft"] = str(total)
                st.session_state["fo_pos_cash"] = 0
                st.session_state["fo_pos_cash_draft"] = ""
                st.rerun()
        with qb2:
            if st.button("현금 전액", key="fo_pos_full_cash", use_container_width=True):
                st.session_state["fo_pos_cash"] = total
                st.session_state["fo_pos_cash_draft"] = str(total)
                st.session_state["fo_pos_card"] = 0
                st.session_state["fo_pos_card_draft"] = ""
                st.rerun()
        with qb3:
            if st.button("초기화", key="fo_pos_reset_pay", use_container_width=True):
                st.session_state["fo_pos_card"] = 0
                st.session_state["fo_pos_card_draft"] = ""
                st.session_state["fo_pos_cash"] = 0
                st.session_state["fo_pos_cash_draft"] = ""
                st.rerun()
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
        clerks = list_pos_clerks_for_store(sb, str(pending_sale["store_id"]))
        if not clerks:
            st.error("이 지점에 배정된 담당자가 없습니다. 「지점·매니저·판매사」에서 담당자를 등록하세요.")
            if st.button("취소", key="fo_pos_save_cancel_no_clerk"):
                st.session_state.pop(K_PENDING_SALE_SAVE, None)
                st.rerun()
            return

        # 담당자 1명이면 선택 단계 생략 — PIN만 입력
        single_clerk = len(clerks) == 1

        if single_clerk:
            clerk_idx = 0
            st.caption(f"담당자: **{clerks[0]['display_name'] or clerks[0]['user_id']}**")
        else:
            clerk_names = [c["display_name"] or c["user_id"] for c in clerks]
            last_idx = min(st.session_state.get("fo_pos_last_clerk_idx", 0), len(clerks) - 1)

        with st.form("fo_pos_confirm_form", clear_on_submit=True):
            if not single_clerk:
                clerk_idx = st.selectbox(
                    "담당자 선택",
                    range(len(clerks)),
                    format_func=lambda i: clerk_names[i],
                    index=last_idx,
                    key="fo_pos_clerk_select",
                )
            clerk_pin = st.text_input(
                "PIN 번호",
                type="password",
                placeholder="담당자 PIN 입력",
                key="fo_pos_clerk_pin",
            )
            b1, b2 = st.columns(2)
            with b1:
                cancel = st.form_submit_button("취소")
            with b2:
                submit = st.form_submit_button("확인 후 저장", type="primary")

        if cancel:
            st.session_state.pop(K_PENDING_SALE_SAVE, None)
            st.rerun()

        if submit:
            if not clerk_pin:
                st.error("PIN을 입력하세요.")
            else:
                try:
                    selected = clerks[clerk_idx]
                    _run_sale_save(
                        sb=sb,
                        store_id=str(pending_sale["store_id"]),
                        sale_day=sale_day,
                        cart=list(pending_sale["cart"]),
                        cash=int(pending_sale["cash"]),
                        card=int(pending_sale["card"]),
                        disc=int(pending_sale["disc"]),
                        dtype_code=pending_sale.get("dtype_code"),
                        clerk_user_id=selected["user_id"],
                        clerk_pin=clerk_pin,
                    )
                    st.session_state["fo_pos_last_clerk_idx"] = clerk_idx
                except (ValueError, RuntimeError) as ex:
                    st.error(str(ex))
                except Exception as ex:
                    st.error(f"저장 실패: {ex}")
    _confirm_sale_dialog()
