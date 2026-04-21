"""바코드 디코드 — 이미지 없이 안전 경로."""

from __future__ import annotations

from lib.barcode_decode import decode_barcode_from_bytes, is_barcode_decode_available


def test_decode_empty() -> None:
    assert decode_barcode_from_bytes(b"") is None


def test_decode_invalid_image() -> None:
    assert decode_barcode_from_bytes(b"not a real image") is None


def test_is_barcode_decode_available_returns_bool() -> None:
    assert isinstance(is_barcode_decode_available(), bool)
