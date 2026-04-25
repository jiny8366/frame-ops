-- FRAME OPS — POS 검색 우선순위 정책
-- 우선순위:
--   1) style_code 정확 일치 (rank=3)
--   2) style_code 부분 일치 (rank=2)
--   3) display_name / color_code 일치 (rank=1)
-- 후순위: color_code 오름차순

begin;

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
      when p.color_code ilike '%' || p_query || '%' then 1.0
      else greatest(
        similarity(coalesce(p.style_code, ''), p_query),
        similarity(coalesce(p.display_name, ''), p_query) * 0.8
      )
    end::real as match_score
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
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
    )
  -- 1차: 매치 점수 내림차순 (정확 일치 우선)
  -- 2차: 컬러 오름차순 (01, 02, 03 순)
  -- 3차: style_code 오름차순 (안정적)
  order by match_score desc, p.color_code asc, p.style_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function search_products_fast to service_role;

comment on function search_products_fast is
  'POS 검색: style_code 정확 일치 우선 → 컬러 오름차순. v3 (2026-04 정책).';

commit;
