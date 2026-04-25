-- FRAME OPS Phase E — 주문리스트 (당일 판매 → 매입처별 발주 자료)
-- 1. fo_sale_items 에 ordered_at / ordered_by_user_id 추가 (발주 확정 추적)
-- 2. RPC get_pending_orders — 기간 내 미발주 sale_items 를 매입처별·제품별 합산
-- 3. RPC mark_orders_placed — 발주 확정 (아이템들에 ordered_at 마킹)

begin;

-- 1. 컬럼 추가 (이미 있으면 무시)
alter table public.fo_sale_items
  add column if not exists ordered_at timestamptz,
  add column if not exists ordered_by_user_id uuid;

create index if not exists idx_fo_sale_items_unordered
  on public.fo_sale_items (sale_id) where ordered_at is null;

-- 2. RPC 정리
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

-- 3. 미발주 항목을 매입처·제품 단위로 합산
--    규칙: 매입처 매핑이 없는 (fo_supplier_brands 미등록) 브랜드는 제외.
--    한 브랜드가 여러 매입처에 매핑돼 있으면 알파벳순 첫 번째 매입처 선택.
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
  with brand_supplier as (
    -- 한 브랜드 → 첫 번째 매입처 (이름 알파벳순)
    select distinct on (sb.brand_id)
      sb.brand_id,
      sb.supplier_id
    from fo_supplier_brands sb
    join fo_suppliers s on s.id = sb.supplier_id
    where s.active = true
    order by sb.brand_id, s.name
  )
  select
    bs.supplier_id,
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
  join fo_brands b on b.id = p.brand_id
  join brand_supplier bs on bs.brand_id = p.brand_id
  join fo_suppliers sup on sup.id = bs.supplier_id
  where sale.store_id = p_store_id
    and (sale.sold_at at time zone 'UTC')::date between p_from and p_to
    and si.ordered_at is null
  group by
    bs.supplier_id, sup.name, sup.supplier_code,
    p.id, p.brand_id, b.name, p.style_code, p.color_code, p.display_name,
    p.sale_price, p.cost_price
  order by sup.name, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_pending_orders(uuid, date, date) to service_role;

-- 4. 발주 확정 — 매입처+기간 매칭 sale_items 에 ordered_at = now()
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
  with brand_supplier as (
    select distinct on (sb.brand_id)
      sb.brand_id,
      sb.supplier_id
    from fo_supplier_brands sb
    join fo_suppliers s on s.id = sb.supplier_id
    where s.active = true
    order by sb.brand_id, s.name
  ),
  target as (
    select si.id
    from fo_sale_items si
    join fo_sales sale on sale.id = si.sale_id
    join fo_products p on p.id = si.product_id
    join brand_supplier bs on bs.brand_id = p.brand_id
    where sale.store_id = p_store_id
      and (sale.sold_at at time zone 'UTC')::date between p_from and p_to
      and si.ordered_at is null
      and bs.supplier_id = p_supplier_id
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
