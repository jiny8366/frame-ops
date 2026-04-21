"""fo_product_codes — 라인 접두·코드 조합."""

from __future__ import annotations

from lib.fo_product_codes import (
    LINE_FRM,
    LINE_SUN,
    build_product_code_base,
    display_name_three_part,
    normalize_product_line,
    sanitize_code_part,
)


def test_normalize_line() -> None:
    assert normalize_product_line("sun") == LINE_SUN
    assert normalize_product_line("SUN") == LINE_SUN
    assert normalize_product_line("") == LINE_FRM
    assert normalize_product_line("frm") == LINE_FRM


def test_build_product_code_base_prefix() -> None:
    c = build_product_code_base(LINE_FRM, "Brand", "2140", "01")
    assert c.startswith("FRM-")
    c2 = build_product_code_base(LINE_SUN, "Brand", "2140", "01")
    assert c2.startswith("SUN-")


def test_display_name_three_part() -> None:
    assert display_name_three_part("A", "B", "C") == "A/B/C"


def test_sanitize() -> None:
    assert sanitize_code_part("ab 12") == "AB-12"
