-- FRAME OPS Web 재고 목록 정합성
--
-- 문제:
-- · get_inventory_computed 가 fo_sale_items 만 합산 → Streamlit 등 fo_sale_lines 만 쓰면 판매=0.
-- · 목록 현재고(computed_stock)만 쓰면 fo_stock 과 불일치.
--
-- 조치:
-- · stock_quantity: 매장별 fo_stock.quantity 우선, 없으면 fo_products.stock_quantity.
-- · 판매 누계: fo_sale_lines 전부 + fo_sale_items(동일 sale_id 에 lines 있으면 items 제외).
-- · computed_stock: 매입−판매(이력 참고용).

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
    select u.product_id, sum(u.qty)::int as q
    from (
      select sl.product_id, sl.quantity::numeric as qty
      from fo_sale_lines sl
      join fo_sales s on s.id = sl.sale_id
      where p_store_id is null or s.store_id = p_store_id
      union all
      select si.product_id, si.quantity::numeric as qty
      from fo_sale_items si
      join fo_sales s on s.id = si.sale_id
      where (p_store_id is null or s.store_id = p_store_id)
        and not exists (
          select 1 from fo_sale_lines sl2 where sl2.sale_id = si.sale_id
        )
    ) u
    group by u.product_id
  ),
  on_hand as (
    select fs.product_id, round(sum(fs.quantity))::int as q
    from fo_stock fs
    where p_store_id is null or fs.store_id = p_store_id
    group by fs.product_id
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
    (
      coalesce(inbound.q, 0) - coalesce(sold.q, 0)
    )::int as computed_stock,
    coalesce(on_hand.q, coalesce(p.stock_quantity, 0))::int as stock_quantity
  from fo_products p
  left join fo_brands b on b.id = p.brand_id
  left join inbound on inbound.product_id = p.id
  left join sold on sold.product_id = p.id
  left join on_hand on on_hand.product_id = p.id
  where p.status = 'active'
  order by p.style_code asc, p.color_code asc
  limit p_limit;
$$;

grant execute on function get_inventory_computed(uuid, int) to service_role, authenticated, anon;

commit;
