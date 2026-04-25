-- FRAME OPS 데이터 정책 정정: "style_code 콜론 = 레거시" 가정 제거
--
-- 배경:
--   Phase 1 마스터 스펙은 "콜론 포함 style_code 는 레거시 데이터" 라는 가정으로
--   /api/products, fo_products_clean 뷰, search_products_fast RPC 모두에 콜론 필터를
--   넣었음. 그러나 2026-04-25 스모크 테스트 결과, 현재 DB 의 정상 데이터가
--   "01:01" 같은 콜론 형식이며 /api/inventory 등 다른 경로는 그대로 반환 중.
--   이 필터 때문에 /pos 검색과 /frames 페이지가 영구히 빈 결과를 반환하던 문제 해결.
--
-- 적용 대상:
--   1) view fo_products_clean (Phase 1 TASK 6)
--   2) function search_products_fast (Phase 2 TASK 6)
--   3) index idx_fo_products_style_color (Phase 1 TASK 6 partial index)
--
-- 영향:
--   - 콜론 형식의 정상 데이터가 카탈로그/검색에 노출됨 (의도)
--   - 만약 향후 진짜 레거시 데이터가 별도로 식별 가능해지면 status 등 다른 기준으로 필터

begin;

-- ── 1. fo_products_clean 뷰 재정의 (콜론 필터 제거) ────────────────────────────
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
order by
  p.style_code,
  p.color_code,
  p.brand_id,
  case when p.product_line is null then 0 else 1 end,
  p.updated_at desc;

comment on view public.fo_products_clean is
  '활성 제품 중복 제거 카탈로그 뷰. (style_code, color_code, brand_id) 기준 DISTINCT ON.';

-- ── 2. search_products_fast RPC 재정의 (콜론 필터 제거) ──────────────────────
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
  'POS 제품 검색: style_code/display_name/color_code 퍼지 매치 + INNER JOIN 브랜드.';

-- ── 3. idx_fo_products_style_color 부분 인덱스 재정의 (콜론 필터 제거) ────────
drop index if exists public.idx_fo_products_style_color;

create index if not exists idx_fo_products_style_color
  on public.fo_products(style_code, color_code)
  where status = 'active';

commit;
