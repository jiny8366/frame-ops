-- FRAME OPS — 상품 피커(브랜드 → 스타일 → 컬러)용 DISTINCT 뷰 + 지원 인덱스
-- 목적: frame_ops/lib/fo_product_pick_utils.py 의 _cached_style_codes /
--       _cached_color_codes 가 한 브랜드의 전체 상품 행을 Python 으로 풀로드해
--       클라이언트에서 set 연산으로 DISTINCT 를 계산하는 병목을 제거.
-- 영향 페이지: 02_POS판매, 03_입고, 04_출고, 05_재고조정, 09_반품 (공통 유틸 공유)
-- 호환성: 기존 Python 호출부의 반환 형태(list[str], 정렬·strip 동일)와 동일.
--         뷰 필터는 "빈 문자열/NULL 제외"만 수행 — status/legacy-colon 필터는
--         도입하지 않음 (현재 클라이언트 동작 보존).

begin;

-- ── 1. 브랜드별 DISTINCT 스타일코드 뷰 ─────────────────────────────────
create or replace view public.fo_product_styles_by_brand as
  select distinct
    brand_id,
    style_code
  from public.fo_products
  where style_code is not null
    and length(trim(style_code)) > 0;

comment on view public.fo_product_styles_by_brand is
  'POS 피커용: 브랜드별 유니크 style_code. fo_product_pick_utils._cached_style_codes 대상.';

-- ── 2. (브랜드, 스타일)별 DISTINCT 컬러코드 뷰 ─────────────────────────
create or replace view public.fo_product_colors_by_style as
  select distinct
    brand_id,
    style_code,
    color_code
  from public.fo_products
  where color_code is not null
    and length(trim(color_code)) > 0
    and style_code is not null
    and length(trim(style_code)) > 0;

comment on view public.fo_product_colors_by_style is
  'POS 피커용: (brand_id, style_code) 별 유니크 color_code. fo_product_pick_utils._cached_color_codes 대상.';

-- ── 3. 지원 인덱스 ────────────────────────────────────────────────────
-- (brand_id, style_code, color_code) 복합 인덱스:
--   두 뷰의 DISTINCT 연산과 .eq() 필터를 동시에 가속.
--   카탈로그 규모 확대 시 뷰 재평가 비용이 O(N) → O(k log N) 수준으로 감소.
create index if not exists idx_fo_products_brand_style_color
  on public.fo_products(brand_id, style_code, color_code);

commit;
