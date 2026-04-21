"""20260416 마이그레이션(반품·정산지출·매장간) 적용 여부."""

from __future__ import annotations

from typing import Any

import streamlit as st
from postgrest.exceptions import APIError


def stop_if_returns_migration_missing(sb: Any) -> None:
    try:
        sb.table("fo_returns").select("id").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (e.message and "Could not find the table" in e.message):
            st.error(
                "반품·정산 지출·매장 간 이동 테이블이 없습니다.\n\n"
                "`supabase/migrations/20260416_frame_ops_returns_interstore.sql` 전체를 실행하세요."
            )
            st.stop()
        raise
