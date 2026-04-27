-- FRAME OPS — get_inbound_pending 에 current_stock 추가
-- 매입 처리 화면에서 현재 재고를 함께 보여주기 위함.

begin;

drop function if exists get_inbound_pending(uuid);

create function get_inbound_pending(p_store_id uuid)
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
  ordered_at_min timestamptz,
  ordered_qty int,
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
    min(si.ordered_at) as ordered_at_min,
    sum(si.quantity - si.inbound_qty - si.hold_qty)::int as ordered_qty,
    p.cost_price::int as cost_price
  from fo_sale_items si
  join fo_sales sale on sale.id = si.sale_id
  join fo_products p on p.id = si.product_id
  left join fo_brands b on b.id = p.brand_id
  left join fo_suppliers sup on sup.id = p.supplier_id
  where sale.store_id = p_store_id
    and si.ordered_at is not null
    and (si.quantity - si.inbound_qty - si.hold_qty) > 0
  group by
    p.supplier_id, sup.name, sup.supplier_code,
    p.id, p.brand_id, b.name, p.style_code, p.color_code, p.display_name,
    p.stock_quantity, p.cost_price
  having sum(si.quantity - si.inbound_qty - si.hold_qty) > 0
  order by sup.name nulls last, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_inbound_pending(uuid) to service_role;

commit;
