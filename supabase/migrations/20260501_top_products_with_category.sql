-- FRAME OPS — get_top_products RPC 에 category / product_line 추가
-- 판매통계 TOP 판매 상품에 {카테고리}{종류} 표시용.

begin;

drop function if exists get_top_products(uuid, date, date, int);

create function get_top_products(
  p_store_id uuid,
  p_from date,
  p_to date,
  p_limit int default 50
)
returns table (
  product_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  category text,
  product_line text,
  total_quantity int,
  total_revenue bigint
)
language sql
stable
as $$
  select
    p.id as product_id,
    b.name as brand_name,
    p.style_code,
    p.color_code,
    p.display_name,
    p.category,
    p.product_line,
    sum(si.quantity)::int as total_quantity,
    sum(si.quantity * si.unit_price - si.discount_amount)::bigint as total_revenue
  from fo_sale_items si
  join fo_sales s on s.id = si.sale_id
  join fo_products p on p.id = si.product_id
  left join fo_brands b on b.id = p.brand_id
  where s.store_id = p_store_id
    and (s.sold_at at time zone 'UTC')::date between p_from and p_to
  group by p.id, b.name, p.style_code, p.color_code, p.display_name, p.category, p.product_line
  order by total_quantity desc, total_revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function get_top_products(uuid, date, date, int) to service_role, authenticated, anon;

commit;
