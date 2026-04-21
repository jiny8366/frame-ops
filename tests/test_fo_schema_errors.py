"""fo_schema_errors — PGRST205 안내 변환."""

from __future__ import annotations

import pytest


def test_raise_if_missing_fo_table_converts() -> None:
    from postgrest.exceptions import APIError

    from lib.fo_schema_errors import FrameOpsSchemaMissing, raise_if_missing_fo_table

    err = APIError(
        {
            "message": "Could not find the table 'public.fo_stores' in the schema cache",
            "code": "PGRST205",
            "hint": "Perhaps you meant the table 'public.stores'",
            "details": None,
        }
    )

    with pytest.raises(FrameOpsSchemaMissing) as ctx:
        raise_if_missing_fo_table(err, table="fo_stores")
    assert "20260413_frame_ops_core" in str(ctx.value)
    assert "fo_stores" in str(ctx.value)
    assert "stores" in str(ctx.value).lower()


def test_raise_if_missing_ignores_other_codes() -> None:
    from postgrest.exceptions import APIError

    from lib.fo_schema_errors import raise_if_missing_fo_table

    err = APIError({"message": "other", "code": "PGRST123"})
    raise_if_missing_fo_table(err, table="fo_stores")  # no raise
