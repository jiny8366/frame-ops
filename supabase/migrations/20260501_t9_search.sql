-- FRAME OPS — T9 (전화기 키패드) 검색 지원
-- 사용자가 키패드 숫자 2~9 만으로 영문 제품명/브랜드를 검색.
-- 매핑: 2=ABC, 3=DEF, 4=GHI, 5=JKL, 6=MNO, 7=PQRS, 8=TUV, 9=WXYZ

begin;

-- 영문 → 키패드 숫자 변환 함수 (immutable, 인덱스 가능)
create or replace function t9_encode(input text)
returns text
language sql
immutable
strict
as $$
  select translate(
    upper(input),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '22233344455566677778889999'
  );
$$;

-- search_products_fast RPC 업데이트: 입력이 모두 숫자(2~9)일 때
--   T9-인코딩된 display_name / brand_name prefix 일치도 후보에 포함.
-- 숫자 4자리 등 style_code 일치는 기존 정확 → 부분 일치 우선순위 유지.
create or replace function search_products_fast(
  p_query text default null,
  p_brand_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  brand_id uuid,
  style_code text,
  color_code text,
  display_name text,
  sale_price int,
  stock_quantity int,
  status text,
  brand_name text,
  match_score real
)
language sql
stable
as $$
  with q as (
    select
      p_query as raw,
      coalesce(p_query, '') ~ '^[2-9]+$' as is_t9
  )
  select
    p.id,
    p.brand_id,
    p.style_code,
    p.color_code,
    p.display_name,
    p.sale_price,
    p.stock_quantity,
    p.status,
    b.name as brand_name,
    case
      when p_query is null or p_query = '' then 1.0
      when p.style_code = p_query then 3.0
      when p.style_code ilike p_query || '%' then 2.5
      when p.style_code ilike '%' || p_query || '%' then 2.0
      when p.display_name ilike '%' || p_query || '%' then 1.5
      when (select is_t9 from q)
        and t9_encode(coalesce(p.display_name, '')) like p_query || '%' then 1.4
      when (select is_t9 from q)
        and t9_encode(coalesce(b.name, '')) like p_query || '%' then 1.3
      when p.color_code ilike '%' || p_query || '%' then 1.0
      else greatest(
        similarity(coalesce(p.style_code, ''), p_query),
        similarity(coalesce(p.display_name, ''), p_query) * 0.8
      )
    end::real as match_score
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  cross join q
  where
    p.status = 'active'
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (
      p_query is null
      or p_query = ''
      or p.style_code   ilike '%' || p_query || '%'
      or p.display_name ilike '%' || p_query || '%'
      or p.color_code   ilike '%' || p_query || '%'
      or similarity(coalesce(p.style_code, ''), p_query) > 0.3
      or (q.is_t9 and t9_encode(coalesce(p.display_name, '')) like p_query || '%')
      or (q.is_t9 and t9_encode(coalesce(b.name, '')) like p_query || '%')
    )
  order by match_score desc, p.color_code asc, p.style_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function t9_encode(text) to service_role, authenticated, anon;
grant execute on function search_products_fast to service_role;

comment on function search_products_fast is
  'POS 검색: style_code 정확 일치 우선 → T9 prefix(2~9 숫자) → 컬러 오름차순. v4 (2026-05).';

commit;
