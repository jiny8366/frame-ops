"""KST·UTC 경계 헬퍼 — DB 없음."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest


def test_business_date_to_timestamptz_noon_kst() -> None:
    from lib.constants import business_date_to_timestamptz

    s = business_date_to_timestamptz(date(2026, 6, 15))
    assert "2026-06-15T12:00:00" in s
    assert "+09:00" in s or s.endswith("+09:00")


def test_kst_day_range_utc_iso_spans_24h_kst() -> None:
    from lib.constants import kst_day_range_utc_iso

    lo, hi = kst_day_range_utc_iso(date(2026, 4, 1))
    start_utc = datetime.fromisoformat(lo.replace("Z", "+00:00"))
    end_utc = datetime.fromisoformat(hi.replace("Z", "+00:00"))
    if start_utc.tzinfo != timezone.utc:
        start_utc = start_utc.astimezone(timezone.utc)
    if end_utc.tzinfo != timezone.utc:
        end_utc = end_utc.astimezone(timezone.utc)
    delta = end_utc - start_utc
    assert delta.total_seconds() == 86400
    # 2026-04-01 00:00 KST → 2026-03-31 15:00 UTC
    assert start_utc == datetime(2026, 3, 31, 15, 0, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    ("iso_in", "expected"),
    [
        ("2026-04-01T15:00:00+00:00", date(2026, 4, 2)),
        ("2026-04-02T00:00:00Z", date(2026, 4, 2)),
        ("2026-04-01T12:00:00+09:00", date(2026, 4, 1)),
    ],
)
def test_iso_to_kst_date(iso_in: str, expected: date) -> None:
    from lib.constants import iso_to_kst_date

    assert iso_to_kst_date(iso_in) == expected


def test_iso_to_kst_date_naive_utc() -> None:
    from lib.constants import iso_to_kst_date

    assert iso_to_kst_date("2026-01-01T00:00:00") == date(2026, 1, 1)
