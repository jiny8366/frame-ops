"""정산(영업일 잠금) — fo_settlements."""

from __future__ import annotations

from datetime import date
from typing import Any

import streamlit as st
from postgrest.exceptions import APIError


def stop_if_settlement_migration_missing(sb: Any) -> None:
    """정산 페이지 전용. fo_settlements 없으면 안내 후 중단."""
    try:
        sb.table("fo_settlements").select("id").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (e.message and "Could not find the table" in e.message):
            st.error(
                "정산 테이블이 없습니다.\n\n"
                "Supabase SQL Editor에서 `supabase/migrations/20260415_frame_ops_settlement.sql` "
                "전체를 실행하세요."
            )
            st.stop()
        raise


def is_business_day_settled(sb: Any, store_id: str, business_day: date) -> bool:
    """
    해당 지점·영업일(한국 달력일 기준)이 정산되어 잠겼는지.
    테이블이 없으면(PGRST205) 잠금 없음으로 간주.
    """
    try:
        r = (
            sb.table("fo_settlements")
            .select("id")
            .eq("store_id", store_id)
            .eq("business_date", business_day.isoformat())
            .limit(1)
            .execute()
            .data
        )
        return bool(r)
    except APIError as e:
        if e.code == "PGRST205" or (e.message and "Could not find the table" in e.message):
            return False
        raise


def settled_warning_message(business_day: date) -> str:
    return (
        f"{business_day.isoformat()} 일자는 정산 완료되어 이 지점에서는 "
        "해당 일자로 판매·입고·출고·조정·반품·매장간이동(발송) 전표를 추가할 수 없습니다."
    )
