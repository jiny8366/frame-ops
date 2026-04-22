"""본사어드민 전용 진입 포털."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="본사어드민 포털 — FRAME OPS",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_portal import (  # noqa: E402
    MODE_HQ,
    render_frame_ops_chrome,
    fo_page_link,
    set_query_param_for_mode,
    set_service_mode,
)

set_service_mode(MODE_HQ)
set_query_param_for_mode(MODE_HQ)
render_frame_ops_chrome()

st.title("본사어드민 포털")
st.caption("전사 운영 전용 포털입니다. 본사어드민은 모든 기능에 접근할 수 있습니다.")

c1, c2, c3 = st.columns(3)
with c1:
    st.markdown("**마스터/권한**")
    fo_page_link("pages/90_admin_portal.py", label="홈 · 지점 등록", icon="🏠")
    fo_page_link("pages/01_상품등록.py", label="상품 등록", icon="📦")
    fo_page_link("pages/17_매입처관리.py", label="매입처 관리", icon="🏷️")
    fo_page_link("pages/14_본사·스태프·권한.py", label="본사·스태프·권한", icon="🧑‍💼")
    fo_page_link("pages/15_지점·매니저·판매사.py", label="지점·매니저·판매사", icon="👤")
with c2:
    st.markdown("**전표/재고**")
    fo_page_link("pages/02_POS판매.py", label="POS 판매", icon="🛒")
    fo_page_link("pages/03_입고.py", label="입고", icon="📥")
    fo_page_link("pages/04_출고.py", label="출고", icon="📤")
    fo_page_link("pages/05_재고조정.py", label="재고 조정", icon="⚖️")
    fo_page_link("pages/06_재고현황.py", label="재고 현황", icon="📊")
    fo_page_link("pages/09_반품.py", label="반품", icon="↩️")
    fo_page_link("pages/10_매장간이동.py", label="매장 간 이동", icon="🚚")
with c3:
    st.markdown("**주문/정산/분석**")
    fo_page_link("pages/07_주문리스트.py", label="주문 리스트", icon="📋")
    fo_page_link("pages/13_매입처리.py", label="매입처리", icon="🧾")
    fo_page_link("pages/08_정산.py", label="정산", icon="🔒")
    fo_page_link("pages/11_통계리포트.py", label="통계 · 리포트", icon="📈")
    fo_page_link("pages/16_판매검색.py", label="판매 검색", icon="🔎")
    fo_page_link("pages/12_판매데이터가져오기.py", label="판매 데이터 가져오기", icon="📑")

