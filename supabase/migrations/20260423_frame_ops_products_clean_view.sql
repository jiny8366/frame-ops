-- FRAME OPS — fo_products_clean 뷰 + 검색/카탈로그 인덱스
-- 목적: 활성 제품만 / 레거시 콜론 style_code 배제 / (style_code, color_code, brand_id) 중복 제거
-- 참고: frameops_optimization_plan.md Phase 2-1, CLAUDE_CODE_WORK_ORDER.md TASK 6

begin;

-- ── 1. 뷰 ─────────────────────────────────────────────────────────────────────
-- 중복 제거: 같은 (style_code, color_code, brand_id)이면 최신 1건만 노출
-- 정렬 규칙: product_line이 null(신 데이터 체계)인 레코드를 우선, 그 다음 updated_at 내림차순
create or replace view public.fo_products_clean as
select distinct on (p.style_code, p.color_code, p.brand_id)
  p.id,
  p.brand_id,
  p.product_code,
  p.style_code,
  p.color_code,
  p.display_name,
  p.category,
  p.sale_price,
  p.cost_price,
  p.suggested_retail,
  p.barcode,
  p.product_line,
  p.status,
  p.created_at,
  p.updated_at,
  b.name as brand_name
from public.fo_products p
left join public.fo_brands b on b.id = p.brand_id
where
  p.status = 'active'
  and p.style_code not like '%:%'
order by
  p.style_code,
  p.color_code,
  p.brand_id,
  case when p.product_line is null then 0 else 1 end,
  p.updated_at desc;

comment on view public.fo_products_clean is
  '활성 제품 / 레거시 콜론 style_code 배제 / (style_code, color_code, brand_id) 중복 제거된 카탈로그 뷰';

-- ── 2. 확장 ──────────────────────────────────────────────────────────────────
-- trigram: ilike 검색 가속
create extension if not exists pg_trgm;

-- ── 3. 인덱스 ────────────────────────────────────────────────────────────────
-- style_code + color_code 복합 인덱스 (카탈로그 정렬·검색)
create index if not exists idx_fo_products_style_color
  on public.fo_products(style_code, color_code)
  where status = 'active' and style_code not like '%:%';

-- brand_id + status 복합 인덱스 (브랜드별 활성 제품 필터)
create index if not exists idx_fo_products_brand_status
  on public.fo_products(brand_id, status);

-- display_name trigram 인덱스 (유사어·부분일치 검색)
create index if not exists idx_fo_products_display_name_trgm
  on public.fo_products using gin (display_name gin_trgm_ops)
  where status = 'active';

commit;
