"""sales_search — 패턴 이스케이프 등 순수 로직."""

from __future__ import annotations

import pytest


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("abc", "abc"),
        ("a%b", "a\\%b"),
        ("a_b", "a\\_b"),
        ("", ""),
    ],
)
def test_escape_ilike_fragment(raw: str, expected: str) -> None:
    from lib.sales_search import escape_ilike_fragment

    assert escape_ilike_fragment(raw) == expected
