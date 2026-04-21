"""상품코드·판매일(KST)로 판매 라인 검색 — 판매담당자 표시."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="판매 검색 — FRAME OPS",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import render_frame_ops_chrome  # noqa: E402

render_frame_ops_chrome()

from lib.sales_search_panel import render_sales_search_panel  # noqa: E402
from lib.supabase_client import get_supabase  # noqa: E402

st.title("판매 검색")
st.caption(
    "**한국 영업일**과 **상품코드(부분 일치)** 로 판매 라인을 찾고, POS 저장 시 기록된 **판매담당자**를 봅니다. "
    "CSV·일괄 가져오기 전표는 담당자가 비어 있을 수 있습니다."
)

try:
    sb = get_supabase()
except RuntimeError as e:
    st.error(str(e))
    st.stop()

render_sales_search_panel(sb, key_prefix="fo_sale_search")

st.page_link("pages/02_POS판매.py", label="← POS 판매")
st.page_link("pages/90_admin_portal.py", label="홈")
