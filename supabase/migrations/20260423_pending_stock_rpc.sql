-- FRAME OPS Phase 2 — get_pending_stock_items RPC
-- stock_quantity < 0 인 제품(매입 대기) 목록.
-- /inventory/pending 페이지에서 사용.
-- 참고: PHASE2_WORK_ORDER_FINAL.md TASK 6-C

begin;

create or replace function get_pending_stock_items()
returns table (
  id uuid,
  style_code text,
  color_code text,
  display_name text,
  brand_name text,
  stock_quantity int,
  pending_count int  -- abs(stock_quantity) = 매입 필요 수량
)
language sql
stable
as $$
  select
    p.id,
    p.style_code,
    p.color_code,
    p.display_name,
    b.name as brand_name,
    p.stock_quantity,
    abs(p.stock_quantity) as pending_count
  from fo_products p
  inner join fo_brands b on b.id = p.brand_id
  where
    p.stock_quantity is not null
    and p.stock_quantity < 0
    and p.status = 'active'
  order by p.stock_quantity asc, p.style_code asc;  -- 더 많이 부족한 것부터
$$;

grant execute on function get_pending_stock_items to service_role;

comment on function get_pending_stock_items is
  '매입 대기 제품 목록: stock_quantity < 0 인 활성 제품을 부족분 내림차순으로. '
  '/inventory/pending 페이지 전용.';

commit;
