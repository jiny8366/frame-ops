-- FRAME OPS — POS 검색 속도 개선
-- 기준: 제품번호(style_code) 우선. brand·display_name 부분일치 등 비-인덱스 경로 제거.
-- T9 (2~9 숫자 입력) 시: style_code / color_code / display_name / brand_name 의 T9-인코딩
--   prefix 매치를 색인 가능한 형태로 사용.
-- 결과: 가장 흔한 케이스(제품번호 prefix) 가 btree 인덱스로 즉시 응답.

begin;

-- T9 prefix 검색을 위한 expression 인덱스 (functional, IMMUTABLE)
create index if not exists idx_fo_products_t9_style
  on public.fo_products (t9_encode(style_code) text_pattern_ops)
  where status = 'active';

create index if not exists idx_fo_products_t9_display
  on public.fo_products (t9_encode(display_name) text_pattern_ops)
  where status = 'active';

create index if not exists idx_fo_brands_t9_name
  on public.fo_brands (t9_encode(name) text_pattern_ops);

-- search_products_fast — style_code 우선 + T9 prefix 보조
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
      coalesce(p_query, '') as raw,
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
      when p.style_code = p_query then 4.0
      when p.style_code ilike p_query || '%' then 3.5
      when p.color_code = p_query then 3.0
      when (select is_t9 from q)
        and t9_encode(coalesce(p.style_code, '')) like p_query || '%' then 2.5
      when (select is_t9 from q)
        and t9_encode(coalesce(p.display_name, '')) like p_query || '%' then 2.0
      when (select is_t9 from q)
        and t9_encode(coalesce(b.name, '')) like p_query || '%' then 1.5
      else 1.0
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
      -- 1순위: style_code prefix (btree)
      or p.style_code ilike p_query || '%'
      -- 2순위: color_code 정확 일치
      or p.color_code = p_query
      -- 3순위: T9 prefix (모두 2~9 숫자일 때만 — 인덱스 사용 가능)
      or (q.is_t9 and t9_encode(coalesce(p.style_code, '')) like p_query || '%')
      or (q.is_t9 and t9_encode(coalesce(p.display_name, '')) like p_query || '%')
      or (q.is_t9 and t9_encode(coalesce(b.name, '')) like p_query || '%')
    )
  order by match_score desc, p.style_code asc, p.color_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function search_products_fast to service_role;

comment on function search_products_fast is
  'POS 검색: 제품번호(style_code) prefix 우선 → T9 prefix 보조. v5 (2026-05). brand·display 부분일치 제거로 속도 개선.';

commit;
