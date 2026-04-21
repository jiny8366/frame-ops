"""FRAME OPS 운영 상수 — 데이터 적재 기준일 등."""

from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

# 한국 영업일 기준으로 전표 시각을 붙일 때 사용
_TZ_SEOUL = ZoneInfo("Asia/Seoul")


def get_data_entry_start_date() -> date:
    """
    DB/전표에 넣을 수 있는 가장 이른 날짜(달력일).
    환경변수 또는 Streamlit Secrets 의 FRAME_OPS_DATA_START_DATE (YYYY-MM-DD). 기본 2026-04-01.
    """
    raw = (os.environ.get("FRAME_OPS_DATA_START_DATE") or "").strip()
    if not raw:
        try:
            import streamlit as st

            sec = getattr(st, "secrets", None)
            if sec is not None and "FRAME_OPS_DATA_START_DATE" in sec:
                raw = str(sec["FRAME_OPS_DATA_START_DATE"]).strip()
        except Exception:
            pass
    if not raw:
        raw = "2026-04-01"
    parts = raw.split("-")
    if len(parts) != 3:
        return date(2026, 4, 1)
    try:
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        return date(y, m, d)
    except ValueError:
        return date(2026, 4, 1)


def business_date_to_timestamptz(d: date) -> str:
    """선택한 영업일의 정오(KST)를 timestamptz ISO 문자열로 (일 경계 혼동 완화)."""
    dt = datetime.combine(d, time(12, 0), tzinfo=_TZ_SEOUL)
    return dt.isoformat()


def today_kst() -> date:
    """현재 시각 기준 한국 날짜."""
    return datetime.now(_TZ_SEOUL).date()


def now_kst_iso() -> str:
    """현재 시각(KST 기준 표기)을 timestamptz ISO 문자열로."""
    return datetime.now(_TZ_SEOUL).isoformat()


def iso_to_kst_date(ts_iso: str) -> date:
    """timestamptz ISO 문자열을 한국 날짜로."""
    s = str(ts_iso).replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_TZ_SEOUL).date()


def kst_day_range_utc_iso(d: date) -> tuple[str, str]:
    """한국 영업일 d의 [시작, 다음날 시작) 구간을 UTC ISO 문자열로 (DB sold_at 필터용)."""
    start_kst = datetime.combine(d, time(0, 0), tzinfo=_TZ_SEOUL)
    end_kst = start_kst + timedelta(days=1)
    return (
        start_kst.astimezone(timezone.utc).isoformat(),
        end_kst.astimezone(timezone.utc).isoformat(),
    )
