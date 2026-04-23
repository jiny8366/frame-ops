-- FRAME OPS Phase 2 — search_products_fast RPC (trigram 퍼지 검색)
-- /pos 에서 제품 검색 as-you-type. 참고: PHASE2_WORK_ORDER_FINAL.md TASK 6-B

begin;

-- trigram 확장 (이미 Phase 1에서 적용돼 있다면 no-op)
create extension if not exists pg_trgm;

-- trigram 인덱스 — ilike/similarity 가속 (status='active' 제품만)
-- 주의: idx_fo_products_display_name_trgm 은 Phase 1 TASK 6 에서 이미 생성됨.
--       여기서 IF NOT EXISTS 로 중복 방지.
create index if not exists idx_fo_products_style_code_trgm
  on fo_products using gin (style_code gin_trgm_ops)
  where status = 'active';

create index if not exists idx_fo_products_display_name_trgm
  on fo_products using gin (display_name gin_trgm_ops)
  where status = 'active';

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
      when p_query is null then 1.0
      else greatest(
        similarity(coalesce(p.style_code, ''),    p_query),
        similarity(coalesce(p.display_name, ''),  p_query) * 0.8,
        similarity(coalesce(p.color_code, ''),    p_query) * 0.6
      )
    end as match_score
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  where
    p.status = 'active'
    and p.style_code not like '%:%'
    and (p_brand_id is null or p.brand_id = p_brand_id)
    and (
      p_query is null
      or p.style_code   ilike '%' || p_query || '%'
      or p.display_name ilike '%' || p_query || '%'
      or p.color_code   ilike '%' || p_query || '%'
      or similarity(coalesce(p.style_code, ''), p_query) > 0.3
    )
  order by match_score desc, p.style_code asc
  limit p_limit offset p_offset;
$$;

grant execute on function search_products_fast to service_role;

comment on function search_products_fast is
  'POS 제품 검색: style_code/display_name/color_code 퍼지 매치 + INNER JOIN 브랜드. '
  'trigram 인덱스 사용, 상위 match_score 순 정렬.';

commit;
