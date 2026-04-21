"""지점용 전용 진입 포털."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="지점용 포털 — FRAME OPS",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import (  # noqa: E402
    MODE_SALES,
    render_frame_ops_chrome,
    set_query_param_for_mode,
    set_service_mode,
)

set_service_mode(MODE_SALES)
set_query_param_for_mode(MODE_SALES)
render_frame_ops_chrome()

st.title("지점용 포털")
st.caption("지점 운영에 필요한 화면만 배치한 포털입니다.")

c1, c2, c3 = st.columns(3)
with c1:
    st.markdown("**일상 입력**")
    st.page_link("pages/02_POS판매.py", label="POS 판매", icon="🛒")
    st.page_link("pages/03_입고.py", label="입고", icon="📥")
    st.page_link("pages/09_반품.py", label="반품", icon="↩️")
with c2:
    st.markdown("**재고/이동**")
    st.page_link("pages/06_재고현황.py", label="재고 현황", icon="📊")
    st.page_link("pages/05_재고조정.py", label="재고 조정", icon="⚖️")
    st.page_link("pages/04_출고.py", label="출고", icon="📤")
    st.page_link("pages/10_매장간이동.py", label="매장 간 이동", icon="🚚")
with c3:
    st.markdown("**마감/조회**")
    st.page_link("pages/08_정산.py", label="정산", icon="🔒")
    st.page_link("pages/07_주문리스트.py", label="주문 리스트", icon="📋")

