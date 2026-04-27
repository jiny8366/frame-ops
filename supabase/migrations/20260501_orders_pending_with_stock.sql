-- FRAME OPS — get_pending_orders 에 current_stock 추가
-- 주문리스트에서 재고 1 (전시 마지막 1개) 인 상품을 시각적 경고로 표시.

begin;

drop function if exists get_pending_orders(uuid, date, date);

create function get_pending_orders(
  p_store_id uuid,
  p_from date,
  p_to date
)
returns table (
  supplier_id uuid,
  supplier_name text,
  supplier_code text,
  product_id uuid,
  brand_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  current_stock int,
  total_quantity int,
  unit_price int,
  cost_price int
)
language sql
stable
as $$
  select
    p.supplier_id,
    sup.name as supplier_name,
    sup.supplier_code,
    p.id as product_id,
    p.brand_id,
    b.name as brand_name,
    p.style_code,
    p.color_code,
    p.display_name,
    coalesce(p.stock_quantity, 0)::int as current_stock,
    sum(si.quantity)::int as total_quantity,
    p.sale_price::int as unit_price,
    p.cost_price::int as cost_price
  from fo_sale_items si
  join fo_sales sale on sale.id = si.sale_id
  join fo_products p on p.id = si.product_id
  left join fo_brands b on b.id = p.brand_id
  left join fo_suppliers sup on sup.id = p.supplier_id
  where sale.store_id = p_store_id
    and (sale.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
    and si.ordered_at is null
  group by
    p.supplier_id, sup.name, sup.supplier_code,
    p.id, p.brand_id, b.name, p.style_code, p.color_code, p.display_name,
    p.stock_quantity, p.sale_price, p.cost_price
  order by sup.name nulls last, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_pending_orders(uuid, date, date) to service_role;

commit;
