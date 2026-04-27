-- FRAME OPS — search_products_fast 결과에 cost_price 추가
-- 매입 등록 검색 모드에서 선택 시 매입가 자동 반영용.

begin;

drop function if exists search_products_fast(text, uuid, int, int);

create function search_products_fast(
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
  cost_price int,
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
    p.cost_price,
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
      or p.style_code ilike p_query || '%'
      or p.color_code = p_query
      or (q.is_t9 and t9_encode(coalesce(p.style_code, '')) like p_query || '%')
      or (q.is_t9 and t9_encode(coalesce(p.display_name, '')) like p_query || '%')
      or (q.is_t9 and t9_encode(coalesce(b.name, '')) like p_query || '%')
    )
  order by match_score desc, p.style_code asc, p.color_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function search_products_fast to service_role;

commit;
