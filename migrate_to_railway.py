"""
Supabase → Railway PostgreSQL 마이그레이션 스크립트
스키마 자동 생성 + 데이터 이전
실행: python migrate_to_railway.py
"""
import sys
import json
import datetime
from pathlib import Path

# ── Railway 연결 설정 ──────────────────────────────────
RAILWAY_HOST = "shinkansen.proxy.rlwy.net"
RAILWAY_PORT = 44427
RAILWAY_USER = "postgres"
RAILWAY_PASS = "tKvcCLXygOXJSdxQckFbvGMaoMDMbTUg"
RAILWAY_DB   = "railway"

# 이전할 테이블 (참조 무결성 순서 — 부모 테이블 먼저)
TABLES = [
    "fo_brands",
    "fo_discount_types",
    "fo_product_categories",
    "fo_suppliers",
    "fo_supplier_brands",
    "fo_stores",
    "fo_staff_job_titles",
    "fo_staff_profiles",
    "fo_staff_roles",
    "fo_staff_store_scopes",
    "fo_products",
    "fo_stock",
    "fo_stock_targets",
    "fo_stock_adjustments",
    "fo_stock_adjustment_lines",
    "fo_inbound_receipts",
    "fo_inbound_lines",
    "fo_purchase_order_sheets",
    "fo_purchase_order_lines",
    "fo_sales",
    "fo_sale_lines",
    "fo_returns",
    "fo_return_lines",
    "fo_settlements",
    "fo_settlement_expenses",
    "fo_interstore_transfers",
    "fo_interstore_transfer_lines",
]
# ──────────────────────────────────────────────────────

def get_supabase():
    sys.path.insert(0, str(Path(__file__).parent / "frame_ops"))
    from lib.supabase_client import get_supabase
    return get_supabase()

def get_railway_conn():
    import psycopg2
    return psycopg2.connect(
        host=RAILWAY_HOST,
        port=RAILWAY_PORT,
        user=RAILWAY_USER,
        password=RAILWAY_PASS,
        dbname=RAILWAY_DB,
    )

def fetch_all_rows(sb, table):
    rows = []
    offset = 0
    while True:
        res = sb.table(table).select("*").range(offset, offset + 999).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows

def infer_pg_type(value):
    """Python 값에서 PostgreSQL 타입 추론"""
    if value is None:
        return "TEXT"
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, int):
        return "BIGINT"
    if isinstance(value, float):
        return "DOUBLE PRECISION"
    if isinstance(value, (dict, list)):
        return "JSONB"
    if isinstance(value, str):
        # 날짜/시간 패턴 감지
        if len(value) == 10 and value[4] == '-' and value[7] == '-':
            return "DATE"
        if 'T' in value and ('+' in value or 'Z' in value):
            return "TIMESTAMPTZ"
        if len(value) > 100:
            return "TEXT"
        return "TEXT"
    return "TEXT"

def infer_schema_from_rows(table, rows):
    """샘플 데이터로 CREATE TABLE 구문 생성"""
    if not rows:
        return None

    # 모든 행을 순회해서 타입 결정
    col_types = {}
    for row in rows:
        for col, val in row.items():
            if val is not None and col not in col_types:
                col_types[col] = infer_pg_type(val)

    # 값이 없는 컬럼은 TEXT로
    for col in rows[0].keys():
        if col not in col_types:
            col_types[col] = "TEXT"

    columns = list(rows[0].keys())
    col_defs = []
    for col in columns:
        pg_type = col_types.get(col, "TEXT")
        if col == "id":
            col_defs.append(f'  "{col}" {pg_type} PRIMARY KEY')
        else:
            col_defs.append(f'  "{col}" {pg_type}')

    col_str = ",\n".join(col_defs)
    return f'CREATE TABLE IF NOT EXISTS "{table}" (\n{col_str}\n);'

def serialize_value(val):
    """Railway INSERT용 값 직렬화"""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, (dict, list)):
        return json.dumps(val, ensure_ascii=False)
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.isoformat()
    return str(val)

def migrate_table(sb, pg_conn, table):
    print(f"\n[{table}]")
    print(f"  Supabase에서 읽는 중...", end="", flush=True)
    rows = fetch_all_rows(sb, table)
    print(f" {len(rows)}건")

    if not rows:
        print("  → 데이터 없음, 테이블만 생성")
        # 빈 테이블은 스키마 없이 최소 생성
        with pg_conn.cursor() as cur:
            cur.execute(f'CREATE TABLE IF NOT EXISTS "{table}" (id TEXT PRIMARY KEY)')
        pg_conn.commit()
        return 0

    # 스키마 생성
    ddl = infer_schema_from_rows(table, rows)
    if ddl:
        with pg_conn.cursor() as cur:
            # 기존 테이블 삭제 후 재생성 (깔끔한 이전)
            cur.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
            cur.execute(ddl)
        pg_conn.commit()
        print(f"  스키마 생성 완료 ✓")

    # 데이터 INSERT
    columns = list(rows[0].keys())
    col_str = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))

    batch = []
    for row in rows:
        values = tuple(serialize_value(row.get(col)) for col in columns)
        batch.append(values)

    with pg_conn.cursor() as cur:
        cur.executemany(
            f'INSERT INTO "{table}" ({col_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING',
            batch,
        )
    pg_conn.commit()
    print(f"  데이터 {len(rows)}건 저장 완료 ✓")
    return len(rows)

def main():
    print("=" * 55)
    print("  Supabase → Railway PostgreSQL 마이그레이션")
    print("=" * 55)

    print("\n1. Supabase 연결 중...")
    try:
        sb = get_supabase()
        print("   Supabase 연결 완료 ✓")
    except Exception as e:
        print(f"   Supabase 연결 실패: {e}")
        return

    print("2. Railway PostgreSQL 연결 중...")
    try:
        pg = get_railway_conn()
        print("   Railway 연결 완료 ✓")
    except Exception as e:
        print(f"   Railway 연결 실패: {e}")
        return

    print(f"\n3. 테이블 {len(TABLES)}개 마이그레이션 시작...\n")
    total = 0
    failed = []

    for table in TABLES:
        try:
            count = migrate_table(sb, pg, table)
            total += count
        except Exception as e:
            print(f"  → 오류: {e}")
            failed.append((table, str(e)))
            try:
                pg.rollback()
            except Exception:
                pg = get_railway_conn()

    pg.close()

    print("\n" + "=" * 55)
    print(f"  마이그레이션 완료!")
    print(f"  총 이전 데이터: {total}건")
    if failed:
        print(f"  실패 테이블 ({len(failed)}개):")
        for t, err in failed:
            print(f"    - {t}: {err}")
    else:
        print(f"  모든 테이블 성공 ✓")
    print("=" * 55)

if __name__ == "__main__":
    main()
