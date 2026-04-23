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
from lib.fo_pos_css import FO_POS_CSS


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


@st.cache_data(ttl=60, show_spinner=False)
def _cached_products_by_style_prefix(supabase_url: str, brand_id: str, style_prefix: str) -> list:
    """브랜드 + 제품번호 앞자리로 제품 목록 검색 — 1분 캐싱."""
    from lib.supabase_client import get_supabase as _gsb
    _sb = _gsb()
    q = (
        _sb.table("fo_products")
        .select("id, display_name, style_code, color_code, sale_price")
        .eq("brand_id", str(brand_id))
    )
    if style_prefix:
        q = q.ilike("style_code", f"{style_prefix}%")
    return q.order("style_code").order("color_code").limit(30).execute().data or []


K_PENDING_SALE_SAVE = "fo_pending_sale_save"
K_POS_PIN_DRAFT = "fo_pos_pin_kpd_draft"
K_OPEN_SALE_SEARCH = "fo_pos_sale_search_open"
# 인라인 그리드 토글 (dialog 대체 — fragment 재실행만 유발)
K_POS_SHOW_BR = "fo_pos_show_br_grid"
K_POS_SHOW_STCO = "fo_pos_show_stco_dlg"   # 제품번호/칼라 통합 검색 다이얼로그
K_POS_STCO_DRAFT = "fo_pos_stco_draft"     # 제품번호/칼라 키패드 입력 버퍼
K_POS_BR_PG = "fo_pos_brand_grid_page"
DEFAULT_CLERK_EMAIL = os.getenv("FO_POS_CLERK_EMAIL", "").strip()
FO_POS_ACTIVE_AMOUNT_KEYPAD = "fo_pos_active_amount_keypad_field"
FO_POS_KPD_DLG_TOP_PX = 100
FO_POS_KPD_DLG_RIGHT_PX = 100

# ── CSS는 lib/fo_pos_css.py 에서 관리 (Apple HIG 디자인 토큰 시스템) ──
FO_POS_KPD_CSS = FO_POS_CSS  # 하위 호환 별칭 유지

_LEGACY_CSS_START = """
<style>
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FRAME OPS · POS 판매 UI
   설계 원칙:
     - 기본(global): PC 마우스 클릭에 최적화된 컴팩트 레이아웃
     - @media (min-width:641px): PC 전용 세부 튜닝
     - @media (max-width:640px): 스마트폰 세로모드 터치 최적화
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ━━━ CSS 변수 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
:root {
  --fo-radius: 8px;
  --fo-surface: rgba(0, 0, 0, 0.35);
  --fo-border: rgba(255, 255, 255, 0.12);
}

/* ━━━ 키패드 LCD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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

/* ━━━ 수량 표시 (상품 담기) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
.fo-pos-qty-display {
  text-align: center;
  font-size: 1.5rem;
  font-weight: 700;
  padding: 0.45rem 0;
  letter-spacing: 0.04em;
  background: var(--fo-surface);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-radius);
}

/* ━━━ 헤더 영역 (1행 4컬럼: 타이틀 | 지점명 | 판매일자 | 판매검색) ━━━━ */
/* 컬럼들 세로 중앙 정렬 — 입력창·버튼·타이틀 한 줄 */
[class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] {
  align-items: center !important;
}
/* POS 판매 타이틀 (<p> 태그) */
.fo-pos-title {
  font-size: 1.55rem !important;
  font-weight: 700 !important;
  margin: 0 !important;
  line-height: 1.2 !important;
  white-space: nowrap;
}

/* ━━━ 섹션 제목 (h5) 간격 축소 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_main_wrap"] h5 {
  margin-top: 0.6rem !important;
  margin-bottom: 0.15rem !important;
}

/* ━━━ 금액 표시 입력창 (disabled) 우정렬 ━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_pay_amounts"] .stTextInput input,
[class*="st-key-fo_pos_disc_row"] .stTextInput input {
  text-align: right;
  font-weight: 600;
  font-size: 1.05rem;
}

/* ━━━ 합계 metric 강조 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_main_wrap"] [data-testid="stMetric"] {
  background: var(--fo-surface);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-radius);
  padding: 0.5rem 0.75rem;
}
[class*="st-key-fo_pos_main_wrap"] [data-testid="stMetricValue"] {
  font-size: 1.55rem !important;
  font-weight: 700 !important;
}

/* ━━━ 인라인 그리드 컨테이너 시각 구분 ━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_br_inline_wrap"],
[class*="st-key-fo_pos_st_inline_wrap"],
[class*="st-key-fo_pos_co_inline_wrap"] {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-radius);
  padding: 0.4rem;
  margin: 0.2rem 0;
}

/* ━━━ PC 최적화 (641px 이상) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
@media screen and (min-width: 641px) {
  /* 헤더 타이틀 (.fo-pos-title) */
  .fo-pos-title {
    font-size: 1.45rem !important;
  }
  /* 헤더 입력창 컴팩트 */
  [class*="st-key-fo_pos_header"] .stTextInput input,
  [class*="st-key-fo_pos_header"] [data-testid="stDateInput"] input {
    font-size: 0.88rem !important;
  }
  /* 판매검색 버튼 */
  [class*="st-key-fo_pos_header"] .stButton > button {
    font-size: 0.9rem !important;
    min-height: 38px !important;
  }
  /* 메인 패널 버튼 기본값 */
  [class*="st-key-fo_pos_main_wrap"] .stButton > button {
    min-height: 44px !important;
    font-size: 0.92rem !important;
  }
  /* 브랜드/제품번호/칼라 선택 버튼 */
  [class*="st-key-fo_pos_product_sel"] .stButton > button {
    min-height: 48px !important;
    font-size: 0.95rem !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
  /* 수량 +/- */
  [class*="st-key-fo_pos_qty_row"] .stButton > button {
    min-height: 44px !important;
    font-size: 1.25rem !important;
    font-weight: 700 !important;
  }
  /* 담기 버튼 */
  [class*="st-key-fo_pos_add_btn"] .stButton > button {
    min-height: 52px !important;
    font-size: 1.0rem !important;
    font-weight: 700 !important;
  }
  /* 결제 빠른버튼(카드전액/현금전액/초기화) */
  [class*="st-key-fo_pos_pay_quick"] .stButton > button {
    min-height: 44px !important;
    font-size: 0.9rem !important;
    font-weight: 600 !important;
  }
  /* 금액입력 '입력' 버튼 */
  [class*="st-key-fo_pos_amt_pop_"] .stButton > button {
    min-height: 42px !important;
    font-size: 0.88rem !important;
  }
  /* 저장 버튼 */
  [class*="st-key-fo_pos_save_btn"] .stButton > button {
    min-height: 56px !important;
    font-size: 1.1rem !important;
    font-weight: 700 !important;
    letter-spacing: 0.05em !important;
  }
  /* 인라인 그리드 버튼 (PC에서는 작게) */
  [class*="st-key-fo_pos_br_inline_wrap"] .stButton > button,
  [class*="st-key-fo_pos_st_inline_wrap"] .stButton > button,
  [class*="st-key-fo_pos_co_inline_wrap"] .stButton > button {
    min-height: 38px !important;
    font-size: 0.84rem !important;
    padding: 4px 6px !important;
  }
  /* 장바구니 삭제 버튼 */
  [class*="st-key-fo_pos_cart_wrap"] .stButton > button {
    min-height: 38px !important;
    font-size: 0.82rem !important;
    padding: 0.1rem 0.4rem !important;
  }
}

/* ━━━ 스마트폰 세로모드 반응형 (640px 이하) ━━━━━━━━━━━━━━━━━━━━ */
@media screen and (max-width: 640px) {

  /* ① 메인 상품/결제 컬럼 → 세로 쌓기 */
  [class*="st-key-fo_pos_main_wrap"] > div > [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
  }
  [class*="st-key-fo_pos_main_wrap"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    width: 100% !important;
    flex: 0 0 100% !important;
    min-width: 100% !important;
  }

  /* ② 헤더 1행 → 모바일에서 2×2 줄바꿈 */
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 4px 0 !important;
  }
  /* 타이틀(col 1)과 검색버튼(col 4) → 첫 번째 행 (각 50%) */
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(1),
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(4) {
    flex: 0 0 50% !important;
    width: 50% !important;
    min-width: 0 !important;
  }
  /* 지점명(col 2)과 판매일자(col 3) → 두 번째 행 (각 50%) */
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(2),
  [class*="st-key-fo_pos_header"] > div > [data-testid="stHorizontalBlock"] > [data-testid="column"]:nth-child(3) {
    flex: 0 0 50% !important;
    width: 50% !important;
    min-width: 0 !important;
  }
  /* 타이틀 */
  .fo-pos-title {
    font-size: 1.25rem !important;
    margin-bottom: 0.3rem !important;
  }
  /* 헤더 입력창·날짜 */
  [class*="st-key-fo_pos_header"] .stTextInput input,
  [class*="st-key-fo_pos_header"] [data-testid="stDateInput"] input {
    font-size: 0.9rem !important;
    min-height: 44px !important;
  }
  /* 판매 검색 버튼 */
  [class*="st-key-fo_pos_header"] .stButton > button {
    min-height: 44px !important;
    font-size: 0.95rem !important;
  }

  /* ③ 전체 버튼 터치 타깃 기본값 */
  .stButton > button {
    min-height: 52px !important;
    font-size: 1.0rem !important;
    line-height: 1.3 !important;
  }

  /* ④ 입력 필드 */
  .stTextInput input,
  .stNumberInput input {
    font-size: 1.05rem !important;
    min-height: 48px !important;
  }

  /* ⑤ 브랜드/제품번호/칼라 선택 버튼 — 터치 타깃 크게 */
  [class*="st-key-fo_pos_product_sel"] .stButton > button {
    min-height: 60px !important;
    font-size: 1.0rem !important;
    font-weight: 700 !important;
    white-space: normal !important;
    word-break: keep-all !important;
  }

  /* ⑥ 수량 표시 */
  .fo-pos-qty-display {
    font-size: 1.35rem !important;
    padding: 0.4rem 0 !important;
  }

  /* ⑦ 수량 +/- 버튼 */
  [class*="st-key-fo_pos_qty_row"] .stButton > button {
    min-height: 58px !important;
    font-size: 1.5rem !important;
    font-weight: 700 !important;
  }

  /* ⑧ 장바구니 담기 버튼 */
  [class*="st-key-fo_pos_add_btn"] .stButton > button {
    min-height: 68px !important;
    font-size: 1.15rem !important;
    font-weight: 700 !important;
  }

  /* ⑨ 장바구니 아이템 텍스트·삭제 버튼 */
  [class*="st-key-fo_pos_cart_wrap"] p {
    font-size: 1.0rem !important;
    line-height: 1.5 !important;
  }
  [class*="st-key-fo_pos_cart_wrap"] .stButton > button {
    min-height: 48px !important;
    min-width: 48px !important;
    font-size: 0.88rem !important;
    padding: 0.1rem 0.3rem !important;
  }

  /* ⑩ 결제 빠른버튼(카드전액/현금전액/초기화) */
  [class*="st-key-fo_pos_pay_quick"] .stButton > button {
    min-height: 58px !important;
    font-size: 1.0rem !important;
    font-weight: 600 !important;
  }

  /* ⑪ 카드·현금 입력 → 세로 쌓기 */
  [class*="st-key-fo_pos_pay_amounts"] [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
  }
  [class*="st-key-fo_pos_pay_amounts"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    width: 100% !important;
    flex: 0 0 100% !important;
    min-width: 100% !important;
  }

  /* ⑫ 할인 입력·유형 → 세로 쌓기 */
  [class*="st-key-fo_pos_disc_row"] [data-testid="stHorizontalBlock"] {
    flex-wrap: wrap !important;
  }
  [class*="st-key-fo_pos_disc_row"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    width: 100% !important;
    flex: 0 0 100% !important;
    min-width: 100% !important;
  }

  /* ⑬ 금액입력 '입력' 버튼 — 세로 하단 정렬 */
  [class*="st-key-fo_pos_amt_pop_"] {
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-end !important;
    padding-bottom: 0.2rem !important;
  }
  [class*="st-key-fo_pos_amt_pop_"] .stButton > button {
    min-height: 50px !important;
    font-size: 0.95rem !important;
  }

  /* ⑭ 합계 metric 모바일 강조 */
  [class*="st-key-fo_pos_main_wrap"] [data-testid="stMetricValue"] {
    font-size: 1.85rem !important;
    font-weight: 700 !important;
  }

  /* ⑮ 저장 버튼 — 모바일 최우선 CTA */
  [class*="st-key-fo_pos_save_btn"] .stButton > button {
    min-height: 76px !important;
    font-size: 1.3rem !important;
    font-weight: 700 !important;
    letter-spacing: 0.06em !important;
  }

  /* ⑯ 금액 키패드 다이얼로그: 모바일에서 화면 중앙 */
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    width: 290px !important;
    min-width: 290px !important;
    max-width: 290px !important;
    margin: 0 !important;
  }
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) > div,
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="dialog"],
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_amt_keypad_scope_"]) [role="document"] {
    padding: 0.5rem !important;
    overflow: visible !important;
    margin: 0 !important;
  }

  /* ⑰ 금액 키패드 내부 컬럼 — 3열 고정 */
  [class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: 4px !important;
  }
  [class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    padding: 0 2px !important;
  }
  [class*="st-key-fo_pos_amt_keypad_scope_"] [data-testid="stButton"] > button {
    width: 100% !important;
    aspect-ratio: 1 / 1 !important;
    height: 64px !important;
    min-height: 64px !important;
    max-height: 64px !important;
    font-size: 1.3rem !important;
    font-weight: 700 !important;
    padding: 0 !important;
    line-height: 1 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* ⑱ 제품번호/칼라 검색 키패드 — 3열 고정 */
  [class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: 4px !important;
  }
  [class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    padding: 0 2px !important;
  }
  [class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stButton"] > button {
    width: 100% !important;
    aspect-ratio: 1 / 1 !important;
    height: 64px !important;
    min-height: 64px !important;
    max-height: 64px !important;
    font-size: 1.3rem !important;
    font-weight: 700 !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  /* 검색 결과 — 모바일 터치 타깃 높이 */
  [class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] > button {
    min-height: 52px !important;
    font-size: 0.88rem !important;
    padding: 10px 14px !important;
  }

  /* ⑲ PIN 키패드 내부 컬럼 — 3열 고정 */
  [class*="st-key-fo_pos_pin_kpd_scope"] [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: 4px !important;
  }
  [class*="st-key-fo_pos_pin_kpd_scope"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    padding: 0 2px !important;
  }
  [class*="st-key-fo_pos_pin_kpd_scope"] [data-testid="stButton"] > button {
    width: 100% !important;
    aspect-ratio: 1 / 1 !important;
    height: 64px !important;
    min-height: 64px !important;
    max-height: 64px !important;
    font-size: 1.3rem !important;
    font-weight: 700 !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  /* PIN 키패드 다이얼로그: 화면 중앙 */
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    width: 300px !important;
    min-width: 300px !important;
    max-width: 300px !important;
    margin: 0 !important;
  }
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="dialog"],
  div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="document"] {
    padding: 0.5rem !important;
    overflow: visible !important;
    margin: 0 !important;
  }

  /* ⑲ 브랜드/제품번호/칼라 인라인 그리드 — 모바일 열 고정 */
  [class*="st-key-fo_pos_br_inline_wrap"] [data-testid="stHorizontalBlock"],
  [class*="st-key-fo_pos_st_inline_wrap"] [data-testid="stHorizontalBlock"],
  [class*="st-key-fo_pos_co_inline_wrap"] [data-testid="stHorizontalBlock"] {
    flex-wrap: nowrap !important;
    gap: 3px !important;
  }
  [class*="st-key-fo_pos_br_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
  [class*="st-key-fo_pos_st_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"],
  [class*="st-key-fo_pos_co_inline_wrap"] [data-testid="stHorizontalBlock"] > [data-testid="column"] {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    padding: 0 2px !important;
  }
  [class*="st-key-fo_pos_br_inline_wrap"] [data-testid="stButton"] > button,
  [class*="st-key-fo_pos_st_inline_wrap"] [data-testid="stButton"] > button,
  [class*="st-key-fo_pos_co_inline_wrap"] [data-testid="stButton"] > button {
    width: 100% !important;
    min-height: 50px !important;
    font-size: 0.82rem !important;
    padding: 6px 2px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }
}
/* ━━━ PIN LCD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
.fo-pos-pin-lcd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.6rem;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f5f5f7;
  margin-bottom: 0.6rem;
  min-height: 3rem;
}
/* ━━━ 제품번호/칼라 선택 다이얼로그 600×700px ━━━━━━━━━━━━━━━━━━━━ */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_stco_kpd_scope"]) [role="dialog"] {
  width: 640px !important;
  min-width: 640px !important;
  max-width: 640px !important;
  max-height: 720px !important;
  overflow-y: auto !important;
}
/* ━━━ 제품번호/칼라 검색 키패드 스코프 ━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_stco_kpd_scope"] {
  --fo-stco-side: 58px;
  width: 210px;
  min-width: 210px;
  max-width: 210px;
  margin-left: 0;
  margin-right: auto;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  padding: 14px 10px;
  box-sizing: border-box;
}
[class*="st-key-fo_pos_stco_kpd_scope"] [data-testid="stButton"] > button {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  height: var(--fo-stco-side) !important;
  min-height: var(--fo-stco-side) !important;
  max-height: var(--fo-stco-side) !important;
  font-size: 1.1rem !important;
  font-weight: 650 !important;
  padding: 0 !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* 검색 결과 — 리스트 행 스타일 */
[class*="st-key-fo_pos_stco_results"] {
  border: 1px solid var(--fo-border);
  border-radius: var(--fo-radius);
  overflow: hidden;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] {
  margin: 0 !important;
  padding: 0 !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] > button {
  background: transparent !important;
  border: none !important;
  border-bottom: 1px solid var(--fo-border) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  text-align: left !important;
  font-size: 0.84rem !important;
  min-height: 44px !important;
  padding: 8px 14px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  color: inherit !important;
  width: 100% !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"] > button:hover {
  background: rgba(255,255,255,0.07) !important;
}
[class*="st-key-fo_pos_stco_results"] [data-testid="stButton"]:last-child > button {
  border-bottom: none !important;
}

/* ━━━ PIN 키패드 스코프 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_pin_kpd_scope"] {
  --fo-pin-side: 68px;
  width: 236px;
  min-width: 236px;
  max-width: 236px;
  margin-left: auto;
  margin-right: auto;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  padding: 8px;
  box-sizing: border-box;
}
[class*="st-key-fo_pos_pin_kpd_scope"] [data-testid="stButton"] > button {
  width: 100% !important;
  aspect-ratio: 1 / 1 !important;
  height: var(--fo-pin-side) !important;
  min-height: var(--fo-pin-side) !important;
  max-height: var(--fo-pin-side) !important;
  font-size: 1.2rem !important;
  font-weight: 650 !important;
  padding: 0.2rem 0.45rem !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}
/* PIN 키패드 다이얼로그: 화면 우측 상단 고정 */
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) {
  position: fixed !important;
  top: __FO_POS_KPD_DLG_TOP_PX__px !important;
  right: __FO_POS_KPD_DLG_RIGHT_PX__px !important;
  left: auto !important;
  bottom: auto !important;
  transform: none !important;
  margin: 0 !important;
  width: 300px !important;
  min-width: 300px !important;
  max-width: 300px !important;
}
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) > div,
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="dialog"],
div[data-testid="stDialog"]:has([class*="st-key-fo_pos_pin_kpd_scope"]) [role="document"] {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[class*="st-key-fo_pos_amt_keypad_scope_"] {
  --fo-kpd-side: 68px;
  width: 236px;
  min-width: 236px;
  max-width: 236px;
  margin-left: auto;
  margin-right: auto;
  border: 2px solid rgba(255, 255, 255, 0.25);
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

/* ━━━ 브랜드 선택 다이얼로그 600×700px ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
[data-baseweb="modal"]:has([class*="st-key-fo_pos_brand_dlg_scope"]) [role="dialog"] {
  width: 620px !important;
  min-width: 620px !important;
  max-width: 620px !important;
  max-height: 700px !important;
  overflow-y: auto !important;
}
[class*="st-key-fo_pos_brand_dlg_scope"] [data-testid="stHorizontalBlock"] {
  flex-wrap: nowrap !important;
  gap: 4px !important;
}
[class*="st-key-fo_pos_brand_dlg_scope"] [data-testid="stButton"] > button {
  height: 50px !important;
  min-height: 50px !important;
  max-height: 50px !important;
  font-size: 0.88rem !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  padding: 0 6px !important;
}
</style>
"""  # _LEGACY_CSS_START (사용 안 함 — FO_POS_CSS 로 대체됨)

with st.container(key="fo_pos_header"):
    hc_title, hc_store, hc_day, hc_search = st.columns([2, 4, 3, 2])
with hc_title:
    st.markdown('<p class="fo-pos-title">POS 판매</p>', unsafe_allow_html=True)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

stores = active_fo_stores_list_or_halt(sb)
if not stores:
    st.warning("홈에서 지점을 먼저 등록하거나 「데모 데이터 넣기」를 실행하세요.")
    st.stop()




def _render_amount_keypad(field_key: str, label: str) -> int:
    """금액은 우측상단 다이얼로그 키패드에서만 편집하고, 적용 시 메인 입력창 반영."""
    current = int(st.session_state.get(field_key, 0) or 0)
    draft_key = f"{field_key}_draft"
    if draft_key not in st.session_state:
        st.session_state[draft_key] = str(current) if current else ""

    show_col, pop_col = st.columns([4, 1])
    with show_col:
        st.text_input(label, value=f"{current:,}", disabled=True)
    with pop_col:
        with st.container(key=f"fo_pos_amt_pop_{field_key}"):
            if st.button("입력", key=f"{field_key}_open_amount_kp", use_container_width=True):
                st.session_state[FO_POS_ACTIVE_AMOUNT_KEYPAD] = field_key
                cur = int(st.session_state.get(field_key, 0) or 0)
                st.session_state[draft_key] = str(cur) if cur else ""

    other_dialog_open = any(
        bool(st.session_state.get(k))
        for k in (
            K_POS_SHOW_BR,
            K_POS_SHOW_STCO,
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


# ──────────────────────────────────────────────────────────────────────────────
# 제품번호/칼라 통합 검색 다이얼로그
# ──────────────────────────────────────────────────────────────────────────────

@st.fragment
def _stco_keypad_fragment(brand_id: str) -> None:
    """제품번호/칼라 통합 검색 — 키패드(좌) + 결과 리스트(우)."""
    st.session_state.setdefault(K_POS_STCO_DRAFT, "")

    def _sadd(d: str) -> None:
        st.session_state[K_POS_STCO_DRAFT] = (st.session_state.get(K_POS_STCO_DRAFT) or "") + d

    col_kpd, col_res = st.columns([5, 7], gap="medium")

    # ── 왼쪽: LCD + 숫자 키패드 ──────────────────────────────────────
    with col_kpd:
        # ① 플레이스홀더 먼저 확보 — 버튼 처리 후 최신 draft로 채움 (one-behind 버그 수정)
        _lcd_ph = st.empty()

        with st.container(key="fo_pos_stco_kpd_scope"):
            r1a, r1b, r1c = st.columns(3)
            with r1a:
                if st.button("1", key="stco_k1", use_container_width=True): _sadd("1")
            with r1b:
                if st.button("2", key="stco_k2", use_container_width=True): _sadd("2")
            with r1c:
                if st.button("3", key="stco_k3", use_container_width=True): _sadd("3")
            r2a, r2b, r2c = st.columns(3)
            with r2a:
                if st.button("4", key="stco_k4", use_container_width=True): _sadd("4")
            with r2b:
                if st.button("5", key="stco_k5", use_container_width=True): _sadd("5")
            with r2c:
                if st.button("6", key="stco_k6", use_container_width=True): _sadd("6")
            r3a, r3b, r3c = st.columns(3)
            with r3a:
                if st.button("7", key="stco_k7", use_container_width=True): _sadd("7")
            with r3b:
                if st.button("8", key="stco_k8", use_container_width=True): _sadd("8")
            with r3c:
                if st.button("9", key="stco_k9", use_container_width=True): _sadd("9")
            r4a, r4b, r4c = st.columns(3)
            with r4a:
                if st.button("지우기", key="stco_kclr", use_container_width=True):
                    st.session_state[K_POS_STCO_DRAFT] = ""
            with r4b:
                if st.button("0", key="stco_k0", use_container_width=True): _sadd("0")
            with r4c:
                if st.button("⌫", key="stco_kbs", use_container_width=True):
                    st.session_state[K_POS_STCO_DRAFT] = (
                        st.session_state.get(K_POS_STCO_DRAFT) or ""
                    )[:-1]

        # ② 버튼 처리 완료 후 최신 draft로 LCD 렌더링 → 항상 현재값 표시
        _draft_now = st.session_state[K_POS_STCO_DRAFT]
        _lcd_ph.markdown(
            f'<div class="fo-pos-keypad-lcd" style="text-align:center;margin-bottom:0.5rem">'
            f'{html.escape(_draft_now) if _draft_now else "—"}</div>',
            unsafe_allow_html=True,
        )

    # ── 오른쪽: 검색 결과 리스트 ──────────────────────────────────────
    with col_res:
        _draft_now = st.session_state[K_POS_STCO_DRAFT]
        products = _cached_products_by_style_prefix(
            get_configured_supabase_url(), str(brand_id), _draft_now
        )
        if products:
            caption = (
                f"**{html.escape(_draft_now)}** 로 시작 · {len(products)}개"
                if _draft_now
                else f"전체 {len(products)}개 (최대 30)"
            )
            st.caption(caption)
            with st.container(key="fo_pos_stco_results"):
                for p in products:
                    # 콜론 포함 제품번호 제외 (DB 수정 전 잔여 데이터 방어)
                    if ":" in str(p.get("style_code", "")):
                        continue
                    # 제품번호/칼라 · 제품명만 표시 (브랜드·가격 제외)
                    lbl = (
                        f"{p.get('style_code','')}/{p.get('color_code','')}"
                        + (f"  {p.get('display_name','')}" if p.get("display_name") else "")
                    )
                    if st.button(lbl, key=f"stco_r_{p['id']}", use_container_width=True):
                        st.session_state["fo_pos_style"] = p["style_code"]
                        st.session_state["fo_pos_color"] = p["color_code"]
                        st.session_state[K_POS_STCO_DRAFT] = ""
                        st.session_state[K_POS_SHOW_STCO] = False
                        st.rerun()
        elif _draft_now:
            st.info(f"**'{html.escape(_draft_now)}'** 로 시작하는 제품이 없습니다.")
        else:
            st.caption("제품번호를 입력하면 목록이 표시됩니다.")


@st.dialog("제품번호 / 칼라 선택", width="large")
def _stco_search_dialog() -> None:
    brand_name = (st.session_state.get("fo_pos_brand_name") or "").strip()
    bid = st.session_state.get("fo_pos_brand_id")
    if brand_name:
        st.caption(f"브랜드: **{html.escape(brand_name)}**")
    if not bid:
        st.error("브랜드를 먼저 선택하세요.")
        if st.button("닫기", key="stco_dlg_err_close", use_container_width=True):
            st.session_state[K_POS_SHOW_STCO] = False
            st.rerun()
        return
    _stco_keypad_fragment(str(bid))
    if st.button("✕ 닫기", key="stco_dlg_close", use_container_width=True):
        st.session_state[K_POS_SHOW_STCO] = False
        st.session_state[K_POS_STCO_DRAFT] = ""
        st.rerun()


@st.dialog("브랜드 선택", width="large")
def _brand_select_dialog() -> None:
    """브랜드 선택 다이얼로그 — 600×700px, 5열 그리드."""
    brands = load_all_brands(None)
    if not brands:
        st.info("등록된 브랜드가 없습니다.")
        if st.button("닫기", key="br_dlg_close_empty", use_container_width=True):
            st.session_state[K_POS_SHOW_BR] = False
            st.rerun()
        return

    with st.container(key="fo_pos_brand_dlg_scope"):
        cols_n = 5
        for row_start in range(0, len(brands), cols_n):
            row_items = brands[row_start : row_start + cols_n]
            cols = st.columns(cols_n)
            for j in range(cols_n):
                with cols[j]:
                    if j < len(row_items):
                        b = row_items[j]
                        nm = str(b.get("name") or "")
                        if st.button(nm, key=f"br_dlg_{b['id']}", use_container_width=True):
                            st.session_state["fo_pos_brand_id"] = str(b["id"])
                            st.session_state["fo_pos_brand_name"] = nm
                            st.session_state["fo_pos_style"] = ""
                            st.session_state["fo_pos_color"] = ""
                            st.session_state[K_POS_SHOW_BR] = False
                            st.rerun()

    st.divider()
    if st.button("닫기", key="br_dlg_close", use_container_width=True):
        st.session_state[K_POS_SHOW_BR] = False
        st.rerun()


@st.fragment
def _product_pick_panel(*, sb, store_id: str, pos_locked: bool) -> None:
    """상품 담기 패널 — fragment로 감싸 좌측만 재실행, 전체 깜빡임 없음."""
    st.markdown("##### 상품 담기")

    # 카메라 ON/OFF 토글 — 페이지 첫 진입 시 항상 OFF
    if "fo_pos_camera_on" not in st.session_state:
        st.session_state["fo_pos_camera_on"] = False
    cam_label = "카메라스캔 끄기" if st.session_state.fo_pos_camera_on else "카메라스캔"
    if st.button(cam_label, key="fo_pos_cam_toggle"):
        st.session_state.fo_pos_camera_on = not st.session_state.fo_pos_camera_on

    if st.session_state.fo_pos_camera_on:
        if not is_barcode_decode_available():
            st.warning("카메라 바코드 인식을 쓰려면 `opencv-python-headless`가 필요합니다.")
        else:
            cam = st.camera_input(
                "바코드가 잘 보이도록 촬영하세요",
                key="fo_pos_barcode_cam",
                label_visibility="collapsed",
            )
            if cam is not None:
                if st.button("이 사진에서 코드 읽기", key="fo_pos_barcode_decode"):
                    raw = decode_barcode_from_bytes(cam.getvalue())
                    if raw is None:
                        st.error("바코드를 읽지 못했습니다. 밝기·거리·각도를 조절해 다시 촬영하세요.")
                    else:
                        st.session_state["fo_lookup"] = raw
                        st.session_state.fo_pos_camera_on = False
                        st.success(f"인식됨: **{raw}**")

    lookup = st.text_input(
        "바코드 / 상품코드 직접 입력", key="fo_lookup",
        placeholder="스캔하거나 코드 입력 후 담기",
    )
    st.session_state.setdefault("fo_pos_brand_id", None)
    st.session_state.setdefault("fo_pos_brand_name", "")
    st.session_state.setdefault("fo_pos_style", "")
    st.session_state.setdefault("fo_pos_color", "")
    st.session_state.setdefault(K_POS_SHOW_BR, False)
    st.session_state.setdefault(K_POS_SHOW_STCO, False)
    st.session_state.setdefault(K_POS_STCO_DRAFT, "")

    _brand_name = (st.session_state.get("fo_pos_brand_name") or "").strip()
    _style_code = (st.session_state.get("fo_pos_style") or "").strip()
    _color_code = (st.session_state.get("fo_pos_color") or "").strip()

    with st.container(key="fo_pos_product_sel"):
        bc1, bc2 = st.columns(2)
        with bc1:
            _lbl_brand = _brand_name if _brand_name else "브랜드"
            if st.button(_lbl_brand, key="fo_pos_btn_brand", use_container_width=True):
                st.session_state[K_POS_SHOW_BR] = True
                st.rerun()
        with bc2:
            # 선택된 값 표시: "제품번호 / 칼라" 또는 기본 레이블
            if _style_code and _color_code:
                _lbl_stco = f"{_style_code} / {_color_code}"
            elif _style_code:
                _lbl_stco = _style_code
            else:
                _lbl_stco = "제품번호 / 칼라"
            if st.button(
                _lbl_stco,
                key="fo_pos_btn_stco",
                use_container_width=True,
                disabled=not st.session_state.get("fo_pos_brand_id"),
            ):
                st.session_state[K_POS_SHOW_STCO] = True
                st.session_state[K_POS_STCO_DRAFT] = ""
                st.session_state[K_POS_SHOW_BR] = False
                st.rerun()  # 전체 재실행 → 다이얼로그 표시

    # 선택된 제품 조회
    bid = st.session_state.get("fo_pos_brand_id")
    sty = (st.session_state.get("fo_pos_style") or "").strip()
    col_v = (st.session_state.get("fo_pos_color") or "").strip()
    selected_product_row = None
    if bid and sty and col_v:
        selected_product_row = _cached_product_by_bsc(
            get_configured_supabase_url(), str(bid), sty, col_v
        )

    # 수량 입력 — 터치 최적화 +/- 버튼
    st.session_state.setdefault("fo_pos_qty_add", 1)
    with st.container(key="fo_pos_qty_row"):
        qc1, qc2, qc3 = st.columns([1, 2, 1])
        with qc1:
            if st.button("－", key="fo_pos_qty_minus", use_container_width=True):
                if st.session_state.fo_pos_qty_add > 1:
                    st.session_state.fo_pos_qty_add -= 1
        with qc2:
            st.markdown(
                f"<div class='fo-pos-qty-display'>{st.session_state.fo_pos_qty_add}개</div>",
                unsafe_allow_html=True,
            )
        with qc3:
            if st.button("＋", key="fo_pos_qty_plus", use_container_width=True):
                st.session_state.fo_pos_qty_add += 1

    qty_add = st.session_state.fo_pos_qty_add

    with st.container(key="fo_pos_add_btn"):
        if st.button("🛒 장바구니에 담기", use_container_width=True):
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
                    st.session_state.fo_pos_qty_add = 1
                    st.session_state[K_POS_SHOW_BR] = False
                    st.success("담았습니다.")
                    st.rerun()  # 전체 재실행: 우측 카트 패널 업데이트


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
    # 결제·할인 금액 초기화
    for _k in ("fo_pos_card", "fo_pos_cash", "fo_pos_disc"):
        st.session_state[_k] = 0
        st.session_state[f"{_k}_draft"] = ""
    # 브랜드·제품번호·칼라 선택 + 그리드/다이얼로그 초기화
    st.session_state["fo_pos_brand_id"] = None
    st.session_state["fo_pos_brand_name"] = ""
    st.session_state["fo_pos_style"] = ""
    st.session_state["fo_pos_color"] = ""
    st.session_state["fo_pos_qty_add"] = 1
    st.session_state["fo_pos_camera_on"] = False
    st.session_state[K_POS_SHOW_BR] = False
    st.session_state[K_POS_SHOW_STCO] = False
    st.session_state[K_POS_STCO_DRAFT] = ""
    st.success(f"저장 완료 · 전표 `{sale_id[:8]}…` · 담당자 반영됨")
    st.balloons()
    st.rerun()

store_idx = default_store_index(stores)
store_obj = stores[store_idx]
store_label = f"{store_obj['store_code']} — {store_obj['name']}"
store_id = store_obj["id"]

# 판매일자 — 세션 상태로 유지 (변경 가능, 달력 컨트롤)
st.session_state.setdefault("fo_pos_sale_day_picker", today_kst())

with hc_store:
    st.text_input(
        "지점명",
        value=store_label,
        disabled=True,
        label_visibility="collapsed",
    )
with hc_day:
    sale_day = st.date_input("판매일자", key="fo_pos_sale_day_picker", label_visibility="collapsed")
with hc_search:
    if st.button("판매 검색", key="fo_pos_open_sale_search", use_container_width=True):
        st.session_state[K_OPEN_SALE_SEARCH] = True
        st.rerun()

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

if st.session_state.get(K_POS_SHOW_STCO):
    _stco_search_dialog()

if st.session_state.get(K_POS_SHOW_BR):
    _brand_select_dialog()

pos_locked = is_business_day_settled(sb, store_id, sale_day)
if pos_locked:
    st.warning(settled_warning_message(sale_day))

if "fo_cart" not in st.session_state:
    st.session_state.fo_cart = []

with st.container(key="fo_pos_main_wrap"):
    left, right = st.columns((5, 7), gap="large")

with left:
    _product_pick_panel(sb=sb, store_id=str(store_id), pos_locked=pos_locked)

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
        st.info("위에서 상품을 담으면 여기에 표시됩니다.")
    else:
        with st.container(key="fo_pos_cart_wrap"):
            for i, line in enumerate(st.session_state.fo_cart):
                c0, c2, c3 = st.columns([6, 2, 1])
                with c0:
                    st.write(f"**{line['display_name']}** ×{line['quantity']}")
                with c2:
                    st.write(f"{line['unit_price']:,}원")
                with c3:
                    if st.button("삭제", key=f"rm_{i}"):
                        st.session_state.fo_cart.pop(i)
                        st.rerun()

        subtotal = sum(int(line["unit_price"] * line["quantity"]) for line in st.session_state.fo_cart)
        # 현재 할인값(세션)으로 합계 미리 계산 — 빠른결제 버튼에 사용
        _disc_now = int(st.session_state.get("fo_pos_disc", 0) or 0)
        _total_now = max(0, subtotal - _disc_now)

        st.markdown("##### 결제처리")
        with st.container(key="fo_pos_pay_quick"):
            qb1, qb2, qb3 = st.columns(3)
            with qb1:
                if st.button("카드 전액", key="fo_pos_full_card", use_container_width=True):
                    st.session_state["fo_pos_card"] = _total_now
                    st.session_state["fo_pos_card_draft"] = str(_total_now)
                    st.session_state["fo_pos_cash"] = 0
                    st.session_state["fo_pos_cash_draft"] = ""
                    st.rerun()
            with qb2:
                if st.button("현금 전액", key="fo_pos_full_cash", use_container_width=True):
                    st.session_state["fo_pos_cash"] = _total_now
                    st.session_state["fo_pos_cash_draft"] = str(_total_now)
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
        with st.container(key="fo_pos_pay_amounts"):
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

        st.markdown("##### 할인")
        with st.container(key="fo_pos_disc_row"):
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

        pay_sum = int(cash) + int(card)
        if pay_sum != total and total > 0:
            st.error(f"현금+카드 **{pay_sum:,}원** ≠ 합계 **{total:,}원**")

        with st.container(key="fo_pos_save_btn"):
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
                st.session_state.pop(K_POS_PIN_DRAFT, None)
                st.rerun()
            return

        single_clerk = len(clerks) == 1
        if single_clerk:
            clerk_idx = 0
            st.caption(f"담당자: **{clerks[0]['display_name'] or clerks[0]['user_id']}**")
        else:
            clerk_names = [c["display_name"] or c["user_id"] for c in clerks]
            last_idx = min(st.session_state.get("fo_pos_last_clerk_idx", 0), len(clerks) - 1)
            clerk_idx = st.selectbox(
                "담당자 선택",
                range(len(clerks)),
                format_func=lambda i: clerk_names[i],
                index=last_idx,
                key="fo_pos_clerk_select",
            )

        # PIN 초기화 (처음 열릴 때만)
        st.session_state.setdefault(K_POS_PIN_DRAFT, "")
        pin_draft = st.session_state[K_POS_PIN_DRAFT]

        # PIN LCD: 입력된 자릿수만큼 ● 표시
        dots = "●" * len(pin_draft) if pin_draft else "—"
        st.markdown(
            f'<div class="fo-pos-pin-lcd">{dots}</div>',
            unsafe_allow_html=True,
        )

        # 숫자 키패드 (브라우저 비밀번호 저장 완전 차단 — input[type=password] 미사용)
        with st.container(key="fo_pos_pin_kpd_scope"):
            def _padd(d: str) -> None:
                if len(st.session_state[K_POS_PIN_DRAFT]) < 6:
                    st.session_state[K_POS_PIN_DRAFT] += d

            r1a, r1b, r1c = st.columns(3)
            with r1a:
                if st.button("7", key="pin_k7", use_container_width=True): _padd("7")
            with r1b:
                if st.button("8", key="pin_k8", use_container_width=True): _padd("8")
            with r1c:
                if st.button("9", key="pin_k9", use_container_width=True): _padd("9")

            r2a, r2b, r2c = st.columns(3)
            with r2a:
                if st.button("4", key="pin_k4", use_container_width=True): _padd("4")
            with r2b:
                if st.button("5", key="pin_k5", use_container_width=True): _padd("5")
            with r2c:
                if st.button("6", key="pin_k6", use_container_width=True): _padd("6")

            r3a, r3b, r3c = st.columns(3)
            with r3a:
                if st.button("1", key="pin_k1", use_container_width=True): _padd("1")
            with r3b:
                if st.button("2", key="pin_k2", use_container_width=True): _padd("2")
            with r3c:
                if st.button("3", key="pin_k3", use_container_width=True): _padd("3")

            r4a, r4b, r4c = st.columns(3)
            with r4a:
                if st.button("초기화", key="pin_kclr", use_container_width=True):
                    st.session_state[K_POS_PIN_DRAFT] = ""
            with r4b:
                if st.button("0", key="pin_k0", use_container_width=True): _padd("0")
            with r4c:
                if st.button("⌫", key="pin_kbs", use_container_width=True):
                    st.session_state[K_POS_PIN_DRAFT] = st.session_state[K_POS_PIN_DRAFT][:-1]

        ca, cb = st.columns(2)
        with ca:
            if st.button("취소", key="fo_pos_pin_cancel", use_container_width=True):
                st.session_state.pop(K_POS_PIN_DRAFT, None)
                st.session_state.pop(K_PENDING_SALE_SAVE, None)
                st.rerun()
        with cb:
            if st.button("확인 후 저장", key="fo_pos_pin_submit",
                         type="primary", use_container_width=True):
                pin = st.session_state.get(K_POS_PIN_DRAFT, "")
                if not pin:
                    st.error("PIN을 입력하세요.")
                else:
                    try:
                        selected = clerks[clerk_idx]
                        st.session_state.pop(K_POS_PIN_DRAFT, None)
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
                            clerk_pin=pin,
                        )
                        st.session_state["fo_pos_last_clerk_idx"] = clerk_idx
                    except (ValueError, RuntimeError) as ex:
                        st.session_state[K_POS_PIN_DRAFT] = ""
                        st.error(str(ex))
                    except Exception as ex:
                        st.session_state[K_POS_PIN_DRAFT] = ""
                        st.error(f"저장 실패: {ex}")
    _confirm_sale_dialog()
