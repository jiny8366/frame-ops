"""
FRAME OPS — 서비스 모드(본사 / 본사 대시보드 / 판매 관리) + 공통 사이드바·상단 메뉴.

- `.streamlit/config.toml` 에 `showSidebarNavigation = false` 일 때 기본 페이지 목록 대신 사용.
- 각 화면(app·pages/*) 첫머리에서 `render_frame_ops_chrome()` 호출.
"""

from __future__ import annotations

import os

SESSION_MODE_KEY = "fo_service_mode"

MODE_HQ = "hq"
MODE_HQ_DASH = "hq_dashboard"
MODE_SALES = "sales"

# 브라우저 주소창 테스트용 쿼리 (?mode=…)
QUERY_MODE_KEY = "mode"
MODE_TO_QUERY_VALUE: dict[str, str] = {
    MODE_HQ: "hq",
    MODE_HQ_DASH: "hq_dashboard",
    MODE_SALES: "sales",
}
_QUERY_VALUE_TO_MODE: dict[str, str] = {
    "hq": MODE_HQ,
    "hq_dashboard": MODE_HQ_DASH,
    "dashboard": MODE_HQ_DASH,
    "dash": MODE_HQ_DASH,
    "sales": MODE_SALES,
}

MODE_LABELS = {
    MODE_HQ: "본사어드민",
    MODE_HQ_DASH: "본사대시보드",
    MODE_SALES: "지점용",
}

MODE_INTROS = {
    MODE_HQ: "마스터/권한/정책/전사 운영",
    MODE_HQ_DASH: "KPI 모니터링/집계 확인",
    MODE_SALES: "매장 전표/POS/재고 처리",
}

# 모드별 사이드바 우선 링크 (설계상 업무 묶음)
SIDEBAR_LINKS: dict[str, list[tuple[str, str, str]]] = {
    MODE_HQ: [
        ("pages/90_admin_portal.py", "본사어드민 포털", "🧭"),
        ("app.py", "홈 · 지점 등록", "🏠"),
        ("pages/01_상품등록.py", "상품 등록", "📦"),
        ("pages/02_POS판매.py", "POS 판매", "🛒"),
        ("pages/03_입고.py", "입고", "📥"),
        ("pages/04_출고.py", "출고", "📤"),
        ("pages/05_재고조정.py", "재고 조정", "⚖️"),
        ("pages/06_재고현황.py", "재고 현황", "📊"),
        ("pages/07_주문리스트.py", "주문 리스트", "📋"),
        ("pages/08_정산.py", "정산", "🔒"),
        ("pages/09_반품.py", "반품", "↩️"),
        ("pages/10_매장간이동.py", "매장 간 이동", "🚚"),
        ("pages/11_통계리포트.py", "통계 · 리포트", "📈"),
        ("pages/12_판매데이터가져오기.py", "판매 데이터 가져오기", "📑"),
        ("pages/13_매입처리.py", "매입처리", "🧾"),
        ("pages/14_본사·스태프·권한.py", "본사 · 스태프 · 권한", "🧑‍💼"),
        ("pages/15_지점·매니저·판매사.py", "지점 · 매니저 · 판매사", "👤"),
        ("pages/16_판매검색.py", "판매 검색", "🔎"),
        ("pages/17_매입처관리.py", "매입처 관리", "🏷️"),
    ],
    MODE_HQ_DASH: [
        ("pages/91_hq_dashboard_portal.py", "본사대시보드 포털", "🧭"),
        ("pages/11_통계리포트.py", "통계 · 리포트 · 차트", "📈"),
    ],
    MODE_SALES: [
        ("pages/92_store_portal.py", "지점용 포털", "🧭"),
        ("pages/03_입고.py", "입고", "📥"),
        ("pages/02_POS판매.py", "POS 판매", "🛒"),
        ("pages/04_출고.py", "출고", "📤"),
        ("pages/06_재고현황.py", "재고 현황", "📊"),
        ("pages/05_재고조정.py", "재고 조정", "⚖️"),
        ("pages/07_주문리스트.py", "주문 리스트", "📋"),
        ("pages/09_반품.py", "반품", "↩️"),
        ("pages/10_매장간이동.py", "매장 간 이동", "🚚"),
        ("pages/08_정산.py", "정산", "🔒"),
    ],
}

# ☰ 메뉴·전체 목록용 (섹션 헤더 → 링크). 사이드바「더 보기」는 같은 섹션의 나머지.
MENU_SECTIONS: list[tuple[str, list[tuple[str, str, str]]]] = [
    (
        "본사어드민",
        [
            ("pages/90_admin_portal.py", "본사어드민 포털", "🧭"),
            ("app.py", "홈 · 지점 등록", "🏠"),
            ("pages/01_상품등록.py", "상품 등록", "📦"),
            ("pages/05_재고조정.py", "재고 조정", "⚖️"),
            ("pages/06_재고현황.py", "재고 현황", "📊"),
            ("pages/07_주문리스트.py", "주문 리스트", "📋"),
            ("pages/08_정산.py", "정산", "🔒"),
            ("pages/11_통계리포트.py", "통계 · 리포트", "📈"),
            ("pages/16_판매검색.py", "판매 검색", "🔎"),
            ("pages/15_지점·매니저·판매사.py", "지점 · 매니저 · 판매사", "👤"),
            ("pages/13_매입처리.py", "매입처리", "🧾"),
            ("pages/12_판매데이터가져오기.py", "판매 데이터 가져오기", "📑"),
            ("pages/14_본사·스태프·권한.py", "본사 · 스태프 · 권한", "🧑‍💼"),
            ("pages/04_출고.py", "출고", "📤"),
            ("pages/09_반품.py", "반품", "↩️"),
            ("pages/10_매장간이동.py", "매장 간 이동", "🚚"),
            ("pages/17_매입처관리.py", "매입처 관리", "🏷️"),
        ],
    ),
    (
        "본사대시보드",
        [
            ("pages/91_hq_dashboard_portal.py", "본사대시보드 포털", "🧭"),
            ("pages/11_통계리포트.py", "통계 · 리포트 · 차트", "📈"),
            ("app.py", "홈 · 지점 요약", "🏠"),
        ],
    ),
    (
        "지점용",
        [
            ("pages/92_store_portal.py", "지점용 포털", "🧭"),
            ("pages/03_입고.py", "입고", "📥"),
            ("pages/02_POS판매.py", "POS 판매", "🛒"),
            ("pages/04_출고.py", "출고", "📤"),
            ("pages/06_재고현황.py", "재고 현황", "📊"),
            ("pages/05_재고조정.py", "재고 조정", "⚖️"),
            ("pages/07_주문리스트.py", "주문 리스트", "📋"),
            ("pages/08_정산.py", "정산", "🔒"),
            ("pages/09_반품.py", "반품", "↩️"),
            ("pages/10_매장간이동.py", "매장 간 이동", "🚚"),
        ],
    ),
]


def get_service_mode() -> str | None:
    import streamlit as st

    m = st.session_state.get(SESSION_MODE_KEY)
    if m in MODE_LABELS:
        return str(m)
    return None


def set_service_mode(mode: str) -> None:
    import streamlit as st

    if mode in MODE_LABELS:
        st.session_state[SESSION_MODE_KEY] = mode


def _query_param_mode_raw() -> str | None:
    """URL `?mode=` 값 (소문자·공백 제거)."""
    import streamlit as st

    try:
        qp = st.query_params
        if hasattr(qp, "get_all"):
            vals = qp.get_all(QUERY_MODE_KEY)
            if not vals:
                return None
            return str(vals[0]).strip().lower()
        v = qp.get(QUERY_MODE_KEY)
        if v is None:
            return None
        if isinstance(v, list):
            return str(v[0]).strip().lower() if v else None
        return str(v).strip().lower()
    except Exception:
        return None


def apply_service_mode_from_query_params() -> None:
    """브라우저 주소창 `?mode=hq|hq_dashboard|sales` 로 모드 고정 (테스트·북마크)."""
    raw = _query_param_mode_raw()
    if not raw:
        return
    mode = _QUERY_VALUE_TO_MODE.get(raw)
    if mode:
        set_service_mode(mode)


def set_query_param_for_mode(mode: str) -> None:
    """세션 모드와 주소창 쿼리를 맞춤 (가능한 경우)."""
    import streamlit as st

    qv = MODE_TO_QUERY_VALUE.get(mode)
    if not qv:
        return
    try:
        cur = _query_param_mode_raw()
        if cur != qv:
            st.query_params[QUERY_MODE_KEY] = qv
    except Exception:
        pass


def navigate_with_mode(mode: str, page: str) -> None:
    """모드 설정 + URL 쿼리 + 페이지 이동."""
    import streamlit as st

    set_service_mode(mode)
    set_query_param_for_mode(mode)
    st.switch_page(page)


def inject_chrome_css() -> None:
    import streamlit as st

    st.markdown(
        """
        <style>
        /* 상단 ☰ — 터치 영역 확대 (모바일) */
        div[data-testid="stPopover"] > button {
            min-height: 2.75rem !important;
            min-width: 2.75rem !important;
            padding: 0.35rem 0.6rem !important;
            font-size: 1.25rem !important;
        }
        /* 사이드바 링크 간격 */
        [data-testid="stSidebar"] a[data-testid="stPageLink-NavLink"] {
            padding-top: 0.35rem;
            padding-bottom: 0.35rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_top_bar_popover() -> None:
    import streamlit as st

    mode = get_service_mode()
    label = MODE_LABELS.get(mode, "시작 전") if mode else "시작 전"
    left, right = st.columns([5, 1])
    with left:
        st.markdown(
            f'<div style="margin:0;padding:0.15rem 0 0.25rem 0;">'
            f'<span style="font-weight:600;font-size:1.05rem;">FRAME OPS</span>'
            f'<span style="color:#888;margin-left:8px;font-size:0.9rem;">{label}</span></div>',
            unsafe_allow_html=True,
        )
    with right:
        with st.popover("☰", help="전체 화면·다른 서비스"):
            st.caption("서비스 전환")
            b1, b2, b3 = st.columns(3)
            with b1:
                if st.button("본사", use_container_width=True, key="fo_pop_hq"):
                    navigate_with_mode(MODE_HQ, "app.py")
            with b2:
                if st.button("대시보드", use_container_width=True, key="fo_pop_dash"):
                    navigate_with_mode(MODE_HQ_DASH, "pages/11_통계리포트.py")
            with b3:
                if st.button("판매관리", use_container_width=True, key="fo_pop_sales"):
                    navigate_with_mode(MODE_SALES, "pages/02_POS판매.py")
            st.divider()
            for sec, links in MENU_SECTIONS:
                st.markdown(f"**{sec}**")
                for path, lab, icon in links:
                    st.page_link(path, label=lab, icon=icon)
            st.divider()
            st.page_link("pages/00_서비스선택.py", label="서비스 선택 화면", icon="🔀")


def _mode_menu_section_index(mode: str) -> int | None:
    if mode == MODE_HQ:
        return 0
    if mode == MODE_HQ_DASH:
        return 1
    if mode == MODE_SALES:
        return 2
    return None


def _render_sidebar() -> None:
    import streamlit as st

    with st.sidebar:
        _lv = os.getenv("FRAME_OPS_LOCAL_VIEW_LABEL", "").strip()
        if _lv:
            st.info(f"로컬뷰 · {_lv}")
        st.markdown("##### FRAME OPS")
        st.page_link("pages/00_서비스선택.py", label="서비스 선택", icon="🔀")
        mode = get_service_mode()
        if mode is None:
            st.info("**서비스 선택**에서 모드를 고르거나 **☰** 로 전체 화면을 여세요.")
        else:
            st.caption(f"**{MODE_LABELS[mode]}** · {MODE_INTROS.get(mode, '')}")
            primary = SIDEBAR_LINKS.get(mode, [])
            seen = {p for p, _, _ in primary}
            for path, lab, icon in primary:
                st.page_link(path, label=lab, icon=icon)
            sec_i = _mode_menu_section_index(mode)
            if sec_i is not None:
                _, sec_links = MENU_SECTIONS[sec_i]
                extra = [(p, l, i) for p, l, i in sec_links if p not in seen]
                if extra:
                    with st.expander("더 보기", expanded=False):
                        for path, lab, icon in extra:
                            st.page_link(path, label=lab, icon=icon)


def _render_code_sync_sidebar_hint() -> None:
    """편집 반영 여부 진단 — 브라우저 캐시가 아니라 서버가 새 파일을 읽는지 확인용."""
    from datetime import datetime
    from pathlib import Path

    import streamlit as st

    root = Path(__file__).resolve().parent.parent
    targets: list[tuple[str, Path]] = [
        ("app.py", root / "app.py"),
        ("상품등록", root / "pages" / "01_상품등록.py"),
    ]
    with st.sidebar:
        with st.expander("코드 반영 확인", expanded=False):
            st.caption(
                "저장 후에도 화면이 그대로면 **터미널에서 Streamlit을 Ctrl+C로 끄고** "
                "`./run_frame_ops.sh` 로 다시 실행하세요. (브라우저 기록 삭제와 무관합니다.)"
            )
            for label, p in targets:
                if p.is_file():
                    ts = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    st.text(f"{label} 수정 시각: {ts}")
                else:
                    st.text(f"{label}: 파일 없음")
            st.caption("로드 기준 경로")
            st.code(str(root), language=None)


def render_frame_ops_chrome() -> None:
    """앱·각 페이지에서 `st.set_page_config` 직후 호출."""
    apply_service_mode_from_query_params()
    inject_chrome_css()
    _render_top_bar_popover()
    _render_sidebar()
    if os.getenv("FRAME_OPS_HIDE_SYNC_HINT", "").strip().lower() not in ("1", "true", "yes"):
        _render_code_sync_sidebar_hint()
