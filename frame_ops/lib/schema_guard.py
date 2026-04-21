"""Supabase 스키마(마이그레이션) 적용 여부 확인."""

from __future__ import annotations

from typing import Any

import streamlit as st
from postgrest.exceptions import APIError

# 20260414_frame_ops_inventory.sql 적용 여부 판별용 (동일 마이그레이션에 포함된 테이블)
_INVENTORY_CANARY = "fo_inbound_receipts"
_PURCHASE_CANARY = "fo_purchase_order_sheets"
_STAFF_RBAC_CANARY = "fo_staff_profiles"
_STAFF_JOB_TITLES_CANARY = "fo_staff_job_titles"


def stop_if_inventory_migration_missing(sb: Any) -> None:
    """
    입고·출고·조정·적정재고 페이지에서 호출.
    테이블이 없으면(PGRST205) 안내 후 st.stop().
    """
    try:
        sb.table(_INVENTORY_CANARY).select("id").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (
            e.message and "Could not find the table" in e.message
        ):
            st.error(
                "재고 확장 테이블이 아직 없습니다.\n\n"
                "Supabase **SQL Editor**에서 아래 파일 **전체**를 실행한 뒤, "
                "잠시 후 이 페이지를 새로고침하세요.\n\n"
                "`supabase/migrations/20260414_frame_ops_inventory.sql`"
            )
            st.stop()
        raise


def stop_if_staff_rbac_migration_missing(sb: Any) -> None:
    """본사·스태프 권한 (`20260420_frame_ops_staff_rbac.sql`)."""
    try:
        sb.table(_STAFF_RBAC_CANARY).select("user_id").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (
            e.message and "Could not find the table" in e.message
        ):
            st.error(
                "스태프·역할 테이블이 아직 없습니다.\n\n"
                "Supabase **SQL Editor**에서 아래 파일 **전체**를 실행한 뒤 새로고침하세요.\n\n"
                "`supabase/migrations/20260420_frame_ops_staff_rbac.sql`"
            )
            st.stop()
        raise


def stop_if_staff_job_titles_migration_missing(sb: Any) -> None:
    """직급 마스터·프로필 확장 (`20260425_frame_ops_staff_job_titles.sql`).

    본사·스태프·권한 페이지는 마이그레이션 없이도 열리도록 바뀌었습니다. 이 함수는
    다른 경로에서 **반드시** 직급 테이블이 있어야 할 때만 사용하세요.
    """
    try:
        sb.table(_STAFF_JOB_TITLES_CANARY).select("code").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (
            e.message and "Could not find the table" in e.message
        ):
            st.error(
                "직급(`fo_staff_job_titles`) 테이블이 아직 없습니다.\n\n"
                "Supabase **SQL Editor**에서 아래 파일 **전체**를 실행한 뒤 새로고침하세요.\n\n"
                "`supabase/migrations/20260425_frame_ops_staff_job_titles.sql`"
            )
            st.stop()
        raise


def stop_if_purchase_orders_migration_missing(sb: Any) -> None:
    """판매 기반 주문서·매입처리 (`20260418_frame_ops_purchase_orders.sql`)."""
    try:
        sb.table(_PURCHASE_CANARY).select("id").limit(1).execute()
    except APIError as e:
        if e.code == "PGRST205" or (
            e.message and "Could not find the table" in e.message
        ):
            st.error(
                "발주·매입 주문 테이블이 아직 없습니다.\n\n"
                "Supabase **SQL Editor**에서 아래 파일 **전체**를 실행한 뒤 새로고침하세요.\n\n"
                "`supabase/migrations/20260418_frame_ops_purchase_orders.sql`"
            )
            st.stop()
        raise
