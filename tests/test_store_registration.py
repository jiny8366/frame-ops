"""store_registration — 지점 등록 점검 헬퍼."""

from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    "store,expected",
    [
        (
            {"store_code": "A", "name": "N", "business_reg_no": "", "address": "", "phone": ""},
            "권장 보완",
        ),
        (
            {
                "store_code": "A",
                "name": "N",
                "business_reg_no": "1",
                "address": "2",
                "phone": "3",
            },
            "완료",
        ),
        ({"store_code": "", "name": "N"}, "필수 미충족"),
    ],
)
def test_store_registration_summary_label(store: dict, expected: str) -> None:
    from lib.store_registration import store_registration_summary_label

    assert store_registration_summary_label(store) == expected


def test_store_registration_mandatory() -> None:
    from lib.store_registration import store_registration_checklist, store_registration_mandatory_ok

    s = {"store_code": "X", "name": ""}
    assert not store_registration_mandatory_ok(s)
    assert sum(1 for r in store_registration_checklist(s) if r["mandatory"] and r["ok"]) == 1
