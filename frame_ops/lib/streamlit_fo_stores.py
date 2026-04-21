"""Streamlit — fo_stores 조회 시 스키마 누락이면 traceback 대신 안내 후 중단."""

from __future__ import annotations

from typing import Any

import streamlit as st

from lib.fo_schema_errors import FO_CORE_MIGRATION, FrameOpsSchemaMissing
from lib.store_defaults import load_stores_with_business_fields


def _halt_schema_missing(err: FrameOpsSchemaMissing) -> None:
    st.error("### FRAME OPS DB 스키마가 이 Supabase에 없습니다")
    st.markdown(str(err))
    st.divider()
    st.markdown("**바로 할 일**")
    st.markdown(
        f"1. Supabase 대시보드 → **SQL Editor**  \n"
        f"2. 저장소에서 **`{FO_CORE_MIGRATION}`** 파일 **전체**를 복사해 실행  \n"
        f"3. `frame_ops/README.md` 의 나머지 **FRAME OPS** 마이그레이션도 순서대로 실행  \n"
        f"4. (선택) 터미널에서 `./run_frame_ops_tests.sh --preflight` 로 테이블 존재 확인"
    )
    st.code(FO_CORE_MIGRATION, language="text")


def load_stores_with_business_fields_or_halt(sb: Any) -> list[dict]:
    """`load_stores_with_business_fields` + 스키마 없으면 안내 후 `st.stop()`."""
    try:
        return load_stores_with_business_fields(sb)
    except FrameOpsSchemaMissing as err:
        _halt_schema_missing(err)
        st.stop()


def active_fo_stores_list_or_halt(sb: Any) -> list[dict]:
    """활성 지점 목록(id, store_code, name). fo_stores 없으면 안내 후 `st.stop()`."""
    try:
        return (
            sb.table("fo_stores")
            .select("id, store_code, name")
            .eq("active", True)
            .execute()
            .data
            or []
        )
    except Exception as e:
        from lib.fo_schema_errors import raise_if_missing_fo_table

        try:
            raise_if_missing_fo_table(e, table="fo_stores")
        except FrameOpsSchemaMissing as err:
            _halt_schema_missing(err)
            st.stop()
        raise
