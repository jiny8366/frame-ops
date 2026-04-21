"""service_portal — 모드 상수·메뉴 구조 (Streamlit 미실행)."""

from __future__ import annotations

from lib.service_portal import (
    MENU_SECTIONS,
    MODE_HQ,
    MODE_HQ_DASH,
    MODE_LABELS,
    MODE_SALES,
    MODE_TO_QUERY_VALUE,
    SESSION_MODE_KEY,
    SIDEBAR_LINKS,
)


def test_session_key_defined() -> None:
    assert SESSION_MODE_KEY == "fo_service_mode"


def test_three_modes_labeled() -> None:
    assert MODE_LABELS[MODE_HQ] == "본사"
    assert MODE_LABELS[MODE_HQ_DASH] == "본사 대시보드"
    assert MODE_LABELS[MODE_SALES] == "판매 관리"


def test_mode_query_values_distinct() -> None:
    assert MODE_TO_QUERY_VALUE[MODE_HQ] == "hq"
    assert MODE_TO_QUERY_VALUE[MODE_HQ_DASH] == "hq_dashboard"
    assert MODE_TO_QUERY_VALUE[MODE_SALES] == "sales"
    assert len({MODE_TO_QUERY_VALUE[m] for m in (MODE_HQ, MODE_HQ_DASH, MODE_SALES)}) == 3


def test_sidebar_covers_menu_paths() -> None:
    """사이드바에 있는 경로는 전체 메뉴 섹션 어딘가에 존재해야 함."""
    all_paths = {p for _, links in MENU_SECTIONS for p, _, _ in links}
    for mode, links in SIDEBAR_LINKS.items():
        for path, _, _ in links:
            assert path in all_paths, f"{mode}: {path} not in MENU_SECTIONS"
