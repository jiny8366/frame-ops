"""서비스 모드 선택 — 본사 / 본사 대시보드 / 판매 관리"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

st.set_page_config(
    page_title="서비스 선택 — FRAME OPS",
    page_icon="🔀",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from lib.service_access_info import (  # noqa: E402
    ACCESS_MARKDOWN_HQ,
    ACCESS_MARKDOWN_HQ_DASH,
    ACCESS_MARKDOWN_SALES,
    DEFAULT_LOCAL_URL,
)
from lib.service_portal import (  # noqa: E402
    MODE_HQ,
    MODE_HQ_DASH,
    MODE_LABELS,
    MODE_SALES,
    MODE_TO_QUERY_VALUE,
    navigate_with_mode,
    render_frame_ops_chrome,
)

render_frame_ops_chrome()

st.title("서비스 선택")
st.caption(
    "설계상 **본사어드민 / 본사대시보드 / 지점용** 으로 나눈 뒤 시작합니다. "
    "브라우저 북마크용 주소는 아래 **모드별 테스트 URL**을 쓰면 됩니다. "
    "언제든 **☰** 에서 다른 화면으로 이동할 수 있습니다."
)

c1, c2, c3 = st.columns(3)
with c1:
    st.markdown(f"### {MODE_LABELS[MODE_HQ]}")
    st.markdown(
        "**포함 화면** · 상품 등록, 재고 조정, 재고 현황, 주문 리스트, 정산, 통계·리포트, "
        "판매 검색, 홈(지점 등록)·지점 매니저. **더 보기**에 매입·스태프·출고·반품·매장 간 이동."
    )
    if st.button("본사 업무 시작", use_container_width=True, type="primary", key="fo_pick_hq"):
        navigate_with_mode(MODE_HQ, "app.py")
with c2:
    st.markdown(f"### {MODE_LABELS[MODE_HQ_DASH]}")
    st.markdown(
        "**포함 화면** · 통계·리포트(차트·표, 데이터 새로고침 시 반영). "
        "사이드바 **더 보기**에서 홈 요약으로 이동."
    )
    if st.button("대시보드 시작", use_container_width=True, type="primary", key="fo_pick_dash"):
        navigate_with_mode(MODE_HQ_DASH, "pages/11_통계리포트.py")
with c3:
    st.markdown(f"### {MODE_LABELS[MODE_SALES]}")
    st.markdown(
        "**포함 화면** · 지점용 포털, 입고, POS 판매, 재고 현황, 주문 리스트, 정산. "
        "**더 보기**에 반품·출고·매장 간 이동·홈."
    )
    if st.button("판매 관리 시작", use_container_width=True, type="primary", key="fo_pick_sales"):
        navigate_with_mode(MODE_SALES, "pages/02_POS판매.py")

st.divider()
st.subheader("서비스별 접속 정보")
st.caption("URL·Supabase 키·POS 담당자 계정 등 업무 구분별로 정리했습니다.")
tab_hq, tab_dash, tab_sales = st.tabs(
    [MODE_LABELS[MODE_HQ], MODE_LABELS[MODE_HQ_DASH], MODE_LABELS[MODE_SALES]]
)
with tab_hq:
    st.markdown(ACCESS_MARKDOWN_HQ)
with tab_dash:
    st.markdown(ACCESS_MARKDOWN_HQ_DASH)
with tab_sales:
    st.markdown(ACCESS_MARKDOWN_SALES)

st.divider()
with st.expander("모드별 테스트 URL (브라우저 주소창·북마크)", expanded=True):
    _b = DEFAULT_LOCAL_URL.rstrip("/")
    _q = MODE_TO_QUERY_VALUE
    st.caption(
        f"베이스 **`{_b}`** — 배포 시 도메인만 바꾸면 됩니다. **`?mode=`** 로 사이드바 묶음을 고정합니다."
    )
    st.code(
        f"# 0) 본사어드민/대시보드/지점용 전용 진입 페이지\n"
        f"{_b}/90_admin_portal\n"
        f"{_b}/91_hq_dashboard_portal\n"
        f"{_b}/92_store_portal\n"
        f"# ① 본사 모드 (홈·지점 등록으로 진입)\n"
        f"{_b}/?mode={_q[MODE_HQ]}\n"
        f"# ② 본사 대시보드 모드 (통계·리포트로 진입하려면 아래처럼 페이지까지)\n"
        f"{_b}/11_%ED%86%B5%EA%B3%84%EB%A6%AC%ED%8F%AC%ED%8A%B8?mode={_q[MODE_HQ_DASH]}\n"
        f"# ③ 판매 관리 모드 (POS로 진입)\n"
        f"{_b}/02_POS%ED%8C%90%EB%A7%A4?mode={_q[MODE_SALES]}\n"
        f"# 서비스 선택 화면\n"
        f"{_b}/00_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%84%A0%ED%83%9D\n"
        f"# 전체 페이지 목록: .venv/bin/python scripts/print_frame_ops_urls.py",
        language="text",
    )

st.divider()
st.markdown("**UI 안내** · 모바일은 왼쪽 **≡** 로 사이드 메뉴, 오른쪽 위 **☰** 로 전체 화면을 열 수 있습니다.")
