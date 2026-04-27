-- FRAME OPS — 재고 조회용 RPC: 매입 누계 - 판매 누계 = 계산 재고
-- fo_products.stock_quantity 의 누적값 대신 거래 이력으로부터 매번 계산.
-- 매장 단위로 집계 (NULL 시 전 매장 합계).

begin;

drop function if exists get_inventory_computed(uuid, int);

create function get_inventory_computed(
  p_store_id uuid default null,
  p_limit int default 1000
)
returns table (
  id uuid,
  product_code text,
  brand_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  category text,
  product_line text,
  cost_price int,
  sale_price int,
  total_inbound int,
  total_sold int,
  computed_stock int,
  stock_quantity int
)
language sql
stable
as $$
  with inbound as (
    select il.product_id, sum(il.quantity)::int as q
    from fo_inbound_lines il
    join fo_inbound_receipts ir on ir.id = il.inbound_receipt_id
    where p_store_id is null or ir.store_id = p_store_id
    group by il.product_id
  ),
  sold as (
    select si.product_id, sum(si.quantity)::int as q
    from fo_sale_items si
    join fo_sales s on s.id = si.sale_id
    where p_store_id is null or s.store_id = p_store_id
    group by si.product_id
  )
  select
    p.id,
    p.product_code,
    p.brand_id,
    b.name as brand_name,
    p.style_code,
    p.color_code,
    p.display_name,
    p.category,
    p.product_line,
    p.cost_price::int,
    p.sale_price::int,
    coalesce(inbound.q, 0) as total_inbound,
    coalesce(sold.q, 0) as total_sold,
    (coalesce(inbound.q, 0) - coalesce(sold.q, 0))::int as computed_stock,
    coalesce(p.stock_quantity, 0)::int as stock_quantity
  from fo_products p
  left join fo_brands b on b.id = p.brand_id
  left join inbound on inbound.product_id = p.id
  left join sold on sold.product_id = p.id
  where p.status = 'active'
  order by p.style_code asc, p.color_code asc
  limit p_limit;
$$;

grant execute on function get_inventory_computed(uuid, int) to service_role, authenticated, anon;

commit;
