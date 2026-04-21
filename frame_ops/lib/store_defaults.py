"""지점 UI 기본 선택 — 우선 매장(북촌) 등."""

from __future__ import annotations

import os
from typing import Any

# seed_bukchon_nopublic.STORE_CODE 와 동일
PREFERRED_STORE_CODE = "BKC01"


def preferred_store_code() -> str:
    """로컬·고객별 시연용 — `FRAME_OPS_PREFERRED_STORE_CODE`가 있으면 그 지점을 기본 선택."""
    v = (os.environ.get("FRAME_OPS_PREFERRED_STORE_CODE") or "").strip()
    return v if v else PREFERRED_STORE_CODE


def _ensure_business_cols(row: dict) -> dict:
    row.setdefault("business_reg_no", "")
    row.setdefault("address", "")
    row.setdefault("phone", "")
    return row


def load_stores_with_business_fields(sb: Any) -> list[dict]:
    """홈·주문서용. 마이그레이션 미적용 시 기본 컬럼만 조회."""
    try:
        rows = (
            sb.table("fo_stores")
            .select("id, store_code, name, active, business_reg_no, address, phone")
            .execute()
            .data
            or []
        )
        return [_ensure_business_cols(dict(r)) for r in rows]
    except Exception as e:
        from lib.fo_schema_errors import raise_if_missing_fo_table

        raise_if_missing_fo_table(e, table="fo_stores")
        try:
            rows = sb.table("fo_stores").select("id, store_code, name, active").execute().data or []
            return [_ensure_business_cols(dict(r)) for r in rows]
        except Exception as e2:
            raise_if_missing_fo_table(e2, table="fo_stores")
            raise


def fetch_store_for_order_header(sb: Any, store_id: str) -> dict:
    """주문서 PDF 헤더용 지점 한 건."""
    try:
        rows = (
            sb.table("fo_stores")
            .select("store_code, name, business_reg_no, address, phone")
            .eq("id", store_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as e:
        from lib.fo_schema_errors import raise_if_missing_fo_table

        raise_if_missing_fo_table(e, table="fo_stores")
        try:
            rows = (
                sb.table("fo_stores")
                .select("store_code, name")
                .eq("id", store_id)
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception as e2:
            raise_if_missing_fo_table(e2, table="fo_stores")
            raise
    if not rows:
        return {"store_code": "", "name": "", "business_reg_no": "", "address": "", "phone": ""}
    return _ensure_business_cols(dict(rows[0]))


def default_store_index(stores: list[dict], *, preferred_code: str | None = None) -> int:
    """selectbox `index=` 용. 없으면 0."""
    code = preferred_code if preferred_code is not None else preferred_store_code()
    for i, s in enumerate(stores):
        if s.get("store_code") == code:
            return i
    return 0


def default_stats_store_label_index(store_labels: list[str], *, preferred_code: str | None = None) -> int:
    """통계 페이지: ['전체', 'BKC01 — …', ...] 에서 BKC01 줄 인덱스, 없으면 0(전체)."""
    code = preferred_code if preferred_code is not None else preferred_store_code()
    prefix = f"{code} —"
    for i, lab in enumerate(store_labels):
        if isinstance(lab, str) and lab.startswith(prefix):
            return i
    return 0


def default_supplier_option_index(options: list[str]) -> int:
    """
    매입처 selectbox — `seed_bukchon_nopublic.SUPPLIER_NAME`(안목)이 있으면 그 인덱스.
    options 예: ['(없음)', '안목', '데모 매입처', ...]
    """
    from lib.seed_bukchon_nopublic import SUPPLIER_NAME

    try:
        return options.index(SUPPLIER_NAME)
    except ValueError:
        return 0


def preferred_product_category() -> str:
    """북촌 No Public 시드와 동일한 카테고리 문자열(필터·플레이스홀더용)."""
    from lib.seed_bukchon_nopublic import PRODUCT_CATEGORY

    return PRODUCT_CATEGORY
