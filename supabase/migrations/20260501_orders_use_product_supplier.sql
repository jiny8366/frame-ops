-- FRAME OPS — 주문리스트 RPC: 매입처 결정 기준을 fo_products.supplier_id 로 전환
-- 기존: fo_supplier_brands(brand → supplier) 매핑 사용 → 매핑 없으면 '매입처 미지정'
-- 수정: 상품 등록 시 부여된 fo_products.supplier_id 를 우선 사용
--   · 상품에 supplier_id 가 있으면 그 매입처
--   · 없으면 '매입처 미지정' (NULL)

begin;

do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname in ('get_pending_orders', 'mark_orders_placed')
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

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
    p.sale_price, p.cost_price
  order by sup.name nulls last, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_pending_orders(uuid, date, date) to service_role;

create function mark_orders_placed(
  p_store_id uuid,
  p_supplier_id uuid,
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  with target as (
    select si.id
    from fo_sale_items si
    join fo_sales sale on sale.id = si.sale_id
    join fo_products p on p.id = si.product_id
    where sale.store_id = p_store_id
      and (sale.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
      and si.ordered_at is null
      and p.supplier_id is not distinct from p_supplier_id
  )
  update fo_sale_items
  set ordered_at = now(),
      ordered_by_user_id = p_user_id
  where id in (select id from target);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function mark_orders_placed(uuid, uuid, date, date, uuid) to service_role;

commit;
