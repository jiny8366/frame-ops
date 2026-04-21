"""북촌·No Public 시드 코드 생성 규칙."""

from __future__ import annotations

from lib.seed_bukchon_nopublic import iter_nopublic_product_codes


def test_nopublic_sku_count_and_uniqueness() -> None:
    xs = list(iter_nopublic_product_codes())
    assert len(xs) == 2950
    assert len(set(xs)) == 2950


def test_nopublic_code_edges() -> None:
    xs = list(iter_nopublic_product_codes())
    assert xs[0] == "01:01-C01"
    assert xs[1] == "01:01-C02"
    assert xs[4] == "01:01-C05"
    assert xs[5] == "01:02-C01"
    assert xs[-1] == "10:59-C05"


def test_sample_codes_in_set() -> None:
    xs = set(iter_nopublic_product_codes())
    assert "03:30-C03" in xs
    assert "10:59-C05" in xs
    assert "01:00-C01" not in xs
    assert "11:01-C01" not in xs
