-- FRAME OPS — 상품코드 v2 정책 적용
-- 형식: {LINE}_{CATEGORY_CODE}/{BRAND_CODE}/{YYMM}/{STYLE4}/{COLOR2}
-- 예: FRM_MTL/ABC/2604/0101/04
--
-- 1. fo_brands.code, fo_product_categories.code 추가 (3자 영문)
-- 2. 기존 데이터 자동 백필
-- 3. fo_products.color_code 정규화 (C04 → 04)
-- 4. fo_products.product_code, barcode 재생성

begin;

-- 1. code 컬럼 추가
alter table public.fo_brands
  add column if not exists code text;

alter table public.fo_product_categories
  add column if not exists code text;

-- 2. 카테고리 백필 (한국어 라벨 → 영문 3자)
update public.fo_product_categories
set code = case label
  when '메탈'         then 'MTL'
  when '플라스틱'     then 'PLA'
  when '아세테이트'   then 'ACE'
  when '나일론'       then 'NYL'
  when 'TR'           then 'TRX'
  when '울템'         then 'ULT'
  when '티타늄'       then 'TIT'
  else upper(left(regexp_replace(label, '[^A-Za-z0-9]+', '', 'g'), 3))
end
where code is null;

-- 라벨이 한국어라 위 매핑에 없는 경우 fallback: 'XXX'
update public.fo_product_categories
set code = 'XXX'
where code is null or code = '' or length(code) = 0;

-- 3. 브랜드 백필 — 이름의 첫 3 영숫자 (대문자)
update public.fo_brands
set code = upper(left(regexp_replace(coalesce(name, ''), '[^A-Za-z0-9]+', '', 'g'), 3))
where code is null;

-- 백필 실패한 경우 'XXX'
update public.fo_brands
set code = 'XXX'
where code is null or length(code) = 0;

-- 4. 컬러 코드 정규화: 'C04' → '04', 'c04' → '04'
update public.fo_products
set color_code = lpad(regexp_replace(color_code, '^[^0-9]+', ''), 2, '0')
where color_code ~ '^[^0-9]';

-- 5. 스타일 코드 4자리 보장 (3자리 이하면 0 패딩)
update public.fo_products
set style_code = lpad(style_code, 4, '0')
where style_code ~ '^[0-9]+$' and length(style_code) < 4 and style_code is not null;

-- 6. product_code, barcode 재생성
with src as (
  select
    p.id,
    upper(coalesce(p.product_line, 'FRM')) as line,
    coalesce(c.code, 'XXX') as cat_code,
    coalesce(b.code, 'XXX') as brand_code,
    to_char(p.created_at, 'YYMM') as yymm,
    -- style_code 가 숫자면 4자리 패딩, 아니면 그대로 (이미 위에서 패딩됨)
    coalesce(nullif(p.style_code, ''), 'XXXX') as style,
    coalesce(nullif(p.color_code, ''), '00') as color
  from fo_products p
  left join fo_brands b on b.id = p.brand_id
  left join fo_product_categories c on c.label = p.category
)
update public.fo_products p
set
  product_code = src.line || '_' || src.cat_code || '/' || src.brand_code || '/' || src.yymm || '/' || src.style || '/' || src.color,
  barcode = src.line || '_' || src.cat_code || '/' || src.brand_code || '/' || src.yymm || '/' || src.style || '/' || src.color
from src
where p.id = src.id;

commit;
