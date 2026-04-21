"""본사대시보드 전용 진입 포털."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="본사대시보드 포털 — FRAME OPS",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import (  # noqa: E402
    MODE_HQ_DASH,
    render_frame_ops_chrome,
    set_query_param_for_mode,
    set_service_mode,
)

set_service_mode(MODE_HQ_DASH)
set_query_param_for_mode(MODE_HQ_DASH)
render_frame_ops_chrome()

st.title("본사대시보드 포털")
st.caption("실적 모니터링/리포트 확인 중심의 진입 주소입니다.")

c1, c2 = st.columns(2)
with c1:
    st.markdown("**핵심 대시보드**")
    st.page_link("pages/11_통계리포트.py", label="통계 · 리포트", icon="📈")
    st.page_link("pages/16_판매검색.py", label="판매 검색", icon="🔎")
with c2:
    st.markdown("**참조 화면**")
    st.page_link("pages/90_admin_portal.py", label="홈 · 지점 요약", icon="🏠")
    st.page_link("pages/06_재고현황.py", label="재고 현황", icon="📊")
    st.page_link("pages/08_정산.py", label="정산", icon="🔒")

