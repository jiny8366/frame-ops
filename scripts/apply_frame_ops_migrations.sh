#!/usr/bin/env bash
# FRAME OPS — supabase/migrations SQL을 psql로 순서대로 적용.
#
# 사용 전:
#   1) Supabase → Project Settings → Database → Connection string → URI 를 복사한다.
#      (직접 만든 postgresql://postgres:비번@db.<ref>.supabase.co 는 쓰지 말 것.
#       많은 프로젝트에서 db.<ref>.supabase.co 가 DNS에 없음 — 터미널에서만 실패하는 이유.)
#   2) 터미널에서:
#        export DATABASE_URL='붙여넣은_URI_전체'
#        ./scripts/apply_frame_ops_migrations.sh
#
# psql 없으면: brew install libpq
#   Apple Silicon: export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "오류: DATABASE_URL 이 비어 있습니다."
  echo ""
  echo "Supabase 대시보드 → Project Settings → Database → Connection string → URI 를 복사한 뒤:"
  echo "  export DATABASE_URL='…복사한 문자열…'"
  echo "  ./scripts/apply_frame_ops_migrations.sh"
  echo ""
  echo "참고: db.<프로젝트>.supabase.co 는 DNS에 없는 경우가 많습니다. 대시보드 URI를 그대로 쓰세요."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "오류: psql 이 없습니다. 설치 예:"
  echo "  brew install libpq"
  echo "  echo 'export PATH=\"/opt/homebrew/opt/libpq/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
  exit 1
fi

FILES=(
  supabase/migrations/20260413_frame_ops_core.sql
  supabase/migrations/20260414_frame_ops_inventory.sql
  supabase/migrations/20260415_frame_ops_settlement.sql
  supabase/migrations/20260416_frame_ops_returns_interstore.sql
  supabase/migrations/20260417_frame_ops_analytics.sql
  supabase/migrations/20260418_frame_ops_purchase_orders.sql
  supabase/migrations/20260419_frame_ops_store_business_fields.sql
  supabase/migrations/20260420_frame_ops_staff_rbac.sql
  supabase/migrations/20260421_frame_ops_store_salesperson_role.sql
  supabase/migrations/20260422_frame_ops_sales_seller_identity.sql
  supabase/migrations/20260423_frame_ops_brands.sql
  supabase/migrations/20260424_frame_ops_product_line_categories.sql
  supabase/migrations/20260425_frame_ops_staff_job_titles.sql
  supabase/migrations/20260426_frame_ops_suppliers_extended.sql
  supabase/migrations/20260428_frame_ops_stock_adjustment_confirm.sql
)

for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "오류: 파일 없음: $f"
    exit 1
  fi
  echo "==> $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo ""
echo "완료. 확인: ./run_frame_ops_tests.sh --preflight"
