"""product_code_suggest."""

from __future__ import annotations

import re

from lib.product_code_suggest import suggest_internal_product_code


def test_suggest_format() -> None:
    s = suggest_internal_product_code("AB")
    assert re.match(r"^AB-\d{8}-[0-9A-F]{8}$", s)


def test_suggest_sanitizes_prefix() -> None:
    s = suggest_internal_product_code("X Y!z")
    assert s.startswith("XYz-")


def test_two_suggestions_differ() -> None:
    assert suggest_internal_product_code("P") != suggest_internal_product_code("P")
