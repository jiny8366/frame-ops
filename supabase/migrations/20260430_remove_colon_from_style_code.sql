-- FRAME OPS — 레거시 콜론(`:`) 제거 데이터 마이그레이션
-- style_code 및 product_code 에서 콜론을 그대로 제거 (예: '01:01' → '0101').
-- 참고: 신규 등록 코드 정책은 sanitize 가 콜론을 '-' 로 치환하지만,
-- 기존 데이터는 콜론을 단순 제거하는 것이 사용자 요구사항.

begin;

-- 사전 검증: 충돌이 발생하지 않는지 확인 (이미 0임을 확인했지만 안전 장치)
do $verify$
declare
  v_conflicts int;
begin
  with cleaned as (
    select
      brand_id,
      replace(coalesce(style_code, ''), ':', '') as new_style,
      color_code,
      product_line,
      count(*) as c
    from fo_products
    group by 1, 2, 3, 4
  )
  select count(*) into v_conflicts from cleaned where c > 1;

  if v_conflicts > 0 then
    raise exception '콜론 제거 시 (brand+style+color+line) 충돌이 % 건 발생. 마이그레이션 중단', v_conflicts;
  end if;
end $verify$;

-- 1. style_code 의 콜론 제거
update public.fo_products
set style_code = replace(style_code, ':', '')
where style_code like '%:%';

-- 2. product_code 의 콜론 제거
update public.fo_products
set product_code = replace(product_code, ':', '')
where product_code like '%:%';

-- 3. barcode 의 콜론 제거 (대부분 product_code 와 동일)
update public.fo_products
set barcode = replace(barcode, ':', '')
where barcode like '%:%';

-- 4. display_name 에 style_code 가 포함된 경우도 갱신 (안전 차원)
update public.fo_products
set display_name = replace(display_name, ':', '')
where display_name like '%:%';

-- 5. fo_inbound_lines 등 외래 테이블은 product_id 로만 참조하므로 영향 없음.

commit;
