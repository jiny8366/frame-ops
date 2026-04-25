-- FRAME OPS Phase B2 확장 — 매입 등록의 '주문 대기 리스트' 모드
-- 1. fo_products.inbound_hold 추가 (매입 보류 플래그)
-- 2. get_pending_for_inbound RPC: 매입처 필터 + 보류 제외 + cost_price 기본단가

begin;

-- 1. 보류 플래그
alter table public.fo_products
  add column if not exists inbound_hold boolean not null default false;

create index if not exists idx_fo_products_pending_inbound
  on public.fo_products (stock_quantity, inbound_hold)
  where stock_quantity < 0 and inbound_hold = false and status = 'active';

-- 2. RPC: 매입처(supplier) 별 매입 대기 제품
do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'get_pending_for_inbound'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function get_pending_for_inbound(
  p_supplier_id uuid default null
)
returns table (
  product_id uuid,
  brand_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  stock_quantity int,
  pending_count int,
  cost_price int,
  inbound_hold boolean
)
language sql
stable
as $$
  select
    p.id as product_id,
    p.brand_id,
    b.name as brand_name,
    p.style_code,
    p.color_code,
    p.display_name,
    p.stock_quantity::int,
    abs(p.stock_quantity)::int as pending_count,
    p.cost_price::int,
    p.inbound_hold
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  where
    p.stock_quantity is not null
    and p.stock_quantity < 0
    and p.status = 'active'
    and (p_supplier_id is null or exists (
      select 1 from fo_supplier_brands sb
      where sb.supplier_id = p_supplier_id and sb.brand_id = p.brand_id
    ))
  order by p.inbound_hold asc, p.stock_quantity asc, p.style_code asc;
$$;

grant execute on function get_pending_for_inbound(uuid) to service_role;

commit;
