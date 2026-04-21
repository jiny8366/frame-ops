#!/usr/bin/env python3
"""
FRAME OPS — DB 스키마 프리플라이트 (Streamlit 불필요).

마이그레이션 적용 여부를 빠르게 확인합니다. 프로젝트 루트에서 실행:

  .venv/bin/python scripts/frame_ops_preflight.py
  Windows: .venv\\Scripts\\python.exe scripts\\frame_ops_preflight.py

환경: 프로젝트 루트 `.env` 또는 배포 시와 동일한 Supabase 환경변수.
종료 코드: 0 = 전부 통과, 1 = 실패 또는 연결 불가.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRAME = ROOT / "frame_ops"
sys.path.insert(0, str(FRAME))

# 각 테이블에 존재하는 컬럼으로 0~1행 조회 (복합 PK 테이블 포함)
_TABLE_SELECT = [
    ("fo_stores", "id"),
    ("fo_suppliers", "id"),
    ("fo_brands", "id"),
    ("fo_product_categories", "id"),
    ("fo_products", "id"),
    ("fo_stock", "store_id"),
    ("fo_discount_types", "id"),
    ("fo_sales", "id"),
    ("fo_sale_lines", "id"),
    ("fo_inbound_receipts", "id"),
    ("fo_inbound_lines", "id"),
    ("fo_outbound_shipments", "id"),
    ("fo_outbound_lines", "id"),
    ("fo_stock_adjustments", "id"),
    ("fo_stock_adjustment_lines", "id"),
    ("fo_stock_targets", "store_id"),
    ("fo_settlements", "id"),
    ("fo_settlement_expenses", "id"),
    ("fo_returns", "id"),
    ("fo_return_lines", "id"),
    ("fo_interstore_transfers", "id"),
    ("fo_interstore_transfer_lines", "id"),
    ("fo_purchase_order_sheets", "id"),
    ("fo_purchase_order_lines", "id"),
    ("fo_staff_roles", "code"),
    ("fo_staff_job_titles", "code"),
    ("fo_staff_profiles", "user_id"),
    ("fo_staff_store_scopes", "user_id"),
]


def main() -> int:
    try:
        from postgrest.exceptions import APIError
    except ImportError:
        print("postgrest 모듈을 찾을 수 없습니다. pip install -r requirements.txt", file=sys.stderr)
        return 1

    try:
        from lib.supabase_client import (
            describe_database_connection,
            get_configured_supabase_url,
            get_supabase,
            is_probably_remote_supabase,
        )
    except ImportError as e:
        print(f"import 실패: {e}", file=sys.stderr)
        return 1

    cap, warn = describe_database_connection()
    if cap:
        print(cap)
    if warn:
        print(f"경고: {warn}", file=sys.stderr)

    try:
        sb = get_supabase()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    url = get_configured_supabase_url()
    if not is_probably_remote_supabase(url):
        print(
            "참고: URL이 로컬입니다. 스테이징/운영 DB 점검이 목적이면 호스팅 supabase.co URL을 쓰세요.",
            file=sys.stderr,
        )

    failed = 0
    for table, col in _TABLE_SELECT:
        try:
            sb.table(table).select(col).limit(1).execute()
            print(f"  OK  {table}")
        except APIError as e:
            msg = (e.message or str(e)) if hasattr(e, "message") else str(e)
            if getattr(e, "code", None) == "PGRST205" or "Could not find the table" in (msg or ""):
                print(f"  FAIL {table}  (테이블 없음 — 마이그레이션 미적용?)", file=sys.stderr)
                failed += 1
            else:
                print(f"  FAIL {table}  {msg}", file=sys.stderr)
                failed += 1
        except Exception as ex:
            print(f"  FAIL {table}  {ex}", file=sys.stderr)
            failed += 1

    # fo_sales.seller_code (analytics 마이그레이션)
    try:
        r = sb.table("fo_sales").select("seller_code").limit(1).execute()
        print("  OK  fo_sales.seller_code (컬럼)")
    except APIError as e:
        msg = getattr(e, "message", None) or str(e)
        if "seller_code" in (msg or "").lower() or "column" in (msg or "").lower():
            print(
                "  WARN fo_sales.seller_code  (컬럼 없음 — 20260417_frame_ops_analytics.sql 적용 권장)",
                file=sys.stderr,
            )
        else:
            print(f"  FAIL fo_sales.seller_code  {msg}", file=sys.stderr)
            failed += 1
    except Exception as ex:
        print(f"  FAIL fo_sales.seller_code  {ex}", file=sys.stderr)
        failed += 1

    try:
        sb.table("fo_sales").select("seller_user_id").limit(1).execute()
        print("  OK  fo_sales.seller_user_id (컬럼)")
    except APIError as e:
        msg = getattr(e, "message", None) or str(e)
        if "seller_user_id" in (msg or "").lower() or "column" in (msg or "").lower():
            print(
                "  WARN fo_sales.seller_user_id  (컬럼 없음 — 20260422_frame_ops_sales_seller_identity.sql 적용 권장)",
                file=sys.stderr,
            )
        else:
            print(f"  FAIL fo_sales.seller_user_id  {msg}", file=sys.stderr)
            failed += 1
    except Exception as ex:
        print(f"  FAIL fo_sales.seller_user_id  {ex}", file=sys.stderr)
        failed += 1

    try:
        sb.table("fo_stock_adjustments").select("status,confirmed_at,confirmed_by").limit(1).execute()
        print("  OK  fo_stock_adjustments.status/confirmed_* (컬럼)")
    except APIError as e:
        msg = getattr(e, "message", None) or str(e)
        if (
            "status" in (msg or "").lower()
            or "confirmed_at" in (msg or "").lower()
            or "confirmed_by" in (msg or "").lower()
            or "column" in (msg or "").lower()
        ):
            print(
                "  WARN fo_stock_adjustments.status/confirmed_*  "
                "(컬럼 없음 — 20260428_frame_ops_stock_adjustment_confirm.sql 적용 권장)",
                file=sys.stderr,
            )
        else:
            print(f"  FAIL fo_stock_adjustments.status/confirmed_*  {msg}", file=sys.stderr)
            failed += 1
    except Exception as ex:
        print(f"  FAIL fo_stock_adjustments.status/confirmed_*  {ex}", file=sys.stderr)
        failed += 1

    if failed:
        print(f"\n실패 {failed}건. supabase/migrations 의 FRAME OPS SQL을 순서대로 적용했는지 확인하세요.", file=sys.stderr)
        return 1
    print("\n프리플라이트 통과.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
