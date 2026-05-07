-- FRAME OPS — product_line CHECK 제약 확장: GGL(고글), RLS(무테) 허용
-- 기존: product_line ∈ {NULL, 'FRM', 'SUN'}
-- 확장: product_line ∈ {NULL, 'FRM', 'SUN', 'GGL', 'RLS'}
--
-- 배경: lib/product-codes.ts 에서 4종 라인(LINE_FRM/LINE_SUN/LINE_RLS/LINE_GGL)을
--       이미 지원하고 있으나, DB CHECK 제약이 FRM/SUN 만 허용하여
--       GGL·RLS 카테고리 상품의 product_line 값을 저장할 수 없는 문제가 있었음.
--       그 결과 /admin/products 화면 '라인' 컬럼이 38건에 대해 '—' 로 표시됨.

begin;

alter table public.fo_products
  drop constraint if exists fo_products_product_line_check;

alter table public.fo_products
  add constraint fo_products_product_line_check
  check (
    product_line is null
    or product_line in ('FRM', 'SUN', 'GGL', 'RLS')
  );

commit;
