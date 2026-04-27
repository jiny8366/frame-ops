-- FRAME OPS — get_pending_orders 의 current_stock 을 거래 이력 기반 계산으로 통일
-- inventory 페이지의 computed_stock 과 일치 (매입누계 - 판매누계)

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
  with inbound_per_product as (
    select il.product_id, sum(il.quantity)::int as q
    from fo_inbound_lines il
    join fo_inbound_receipts ir on ir.id = il.inbound_receipt_id
    where ir.store_id = p_store_id
    group by il.product_id
  ),
  sold_per_product as (
    select si.product_id, sum(si.quantity)::int as q
    from fo_sale_items si
    join fo_sales s on s.id = si.sale_id
    where s.store_id = p_store_id
    group by si.product_id
  )
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
    (coalesce(ipp.q, 0) - coalesce(spp.q, 0))::int as current_stock,
    sum(si.quantity - si.inbound_qty - si.hold_qty)::int as total_quantity,
    p.sale_price::int as unit_price,
    p.cost_price::int as cost_price
  from fo_sale_items si
  join fo_sales sale on sale.id = si.sale_id
  join fo_products p on p.id = si.product_id
  left join fo_brands b on b.id = p.brand_id
  left join fo_suppliers sup on sup.id = p.supplier_id
  left join inbound_per_product ipp on ipp.product_id = p.id
  left join sold_per_product spp on spp.product_id = p.id
  where sale.store_id = p_store_id
    and (sale.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
    and si.ordered_at is null
    and (si.quantity - si.inbound_qty - si.hold_qty) > 0
  group by
    p.supplier_id, sup.name, sup.supplier_code,
    p.id, p.brand_id, b.name, p.style_code, p.color_code, p.display_name,
    p.sale_price, p.cost_price, ipp.q, spp.q
  having sum(si.quantity - si.inbound_qty - si.hold_qty) > 0
  order by sup.name nulls last, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_pending_orders(uuid, date, date) to service_role;

commit;
