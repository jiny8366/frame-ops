"""store_defaults — 우선 지점 인덱스."""

from __future__ import annotations

import pytest

from lib.store_defaults import (
    PREFERRED_STORE_CODE,
    default_stats_store_label_index,
    default_store_index,
    default_supplier_option_index,
    preferred_product_category,
    preferred_store_code,
)


def test_preferred_store_code_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRAME_OPS_PREFERRED_STORE_CODE", raising=False)
    assert preferred_store_code() == PREFERRED_STORE_CODE
    monkeypatch.setenv("FRAME_OPS_PREFERRED_STORE_CODE", "MA01")
    assert preferred_store_code() == "MA01"


def test_default_store_index_prefers_bkc01() -> None:
    stores = [
        {"id": "a", "store_code": "TST01", "name": "A"},
        {"id": "b", "store_code": "BKC01", "name": "북촌"},
    ]
    assert default_store_index(stores) == 1


def test_default_store_index_respects_env_preferred(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_PREFERRED_STORE_CODE", "MA01")
    stores = [
        {"id": "a", "store_code": "TST01", "name": "A"},
        {"id": "b", "store_code": "MA01", "name": "명안당"},
    ]
    assert default_store_index(stores) == 1


def test_default_store_index_explicit_arg_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_PREFERRED_STORE_CODE", "MA01")
    stores = [
        {"id": "a", "store_code": "BKC01", "name": "북촌"},
        {"id": "b", "store_code": "MA01", "name": "명안당"},
    ]
    assert default_store_index(stores, preferred_code="BKC01") == 0


def test_default_store_index_missing_returns_zero() -> None:
    stores = [{"id": "a", "store_code": "X", "name": "Y"}]
    assert default_store_index(stores) == 0


def test_default_stats_store_label_index() -> None:
    labels = ["전체", "TST01 — A", "BKC01 — 서울 북촌점"]
    assert default_stats_store_label_index(labels) == 2
    assert default_stats_store_label_index(["전체"]) == 0


def test_default_stats_store_label_index_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRAME_OPS_PREFERRED_STORE_CODE", "MA01")
    labels = ["전체", "MA01 — 명안당", "BKC01 — 서울 북촌점"]
    assert default_stats_store_label_index(labels) == 1


def test_default_supplier_option_index() -> None:
    assert default_supplier_option_index(["(없음)", "안목", "기타"]) == 1
    assert default_supplier_option_index(["(없음)", "기타"]) == 0


def test_preferred_product_category_matches_seed() -> None:
    from lib.seed_bukchon_nopublic import PRODUCT_CATEGORY

    assert preferred_product_category() == PRODUCT_CATEGORY


def test_preferred_code_constant_matches_seed() -> None:
    from lib.seed_bukchon_nopublic import STORE_CODE, SUPPLIER_NAME

    assert PREFERRED_STORE_CODE == STORE_CODE
    assert SUPPLIER_NAME == "안목"
