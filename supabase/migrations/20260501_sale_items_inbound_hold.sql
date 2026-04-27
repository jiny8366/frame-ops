-- FRAME OPS — sale_items 부분 입고/보류 추적
-- ordered_at: 발주 처리 시점 (기존)
-- inbound_qty: 매입 처리된 수량 (신규)
-- hold_qty: 주문보류 처리된 수량 (신규)
-- inbound_by_user_id: 매입 처리자
--
-- 잔여 미입고 = quantity - inbound_qty - hold_qty
--   · ordered_at NULL  + 잔여 > 0 → 주문 대기 (admin/orders 의 주문리스트)
--   · ordered_at SET   + 잔여 > 0 → 매입 대기 (admin/inbound 의 주문리스트)

begin;

alter table public.fo_sale_items
  add column if not exists inbound_qty int not null default 0,
  add column if not exists hold_qty int not null default 0,
  add column if not exists inbound_by_user_id uuid,
  add column if not exists inbound_at timestamptz;

create index if not exists idx_fo_sale_items_pending_inbound
  on public.fo_sale_items (ordered_at)
  where ordered_at is not null;

-- ── 매입 대기 리스트 (ordered 했으나 아직 입고 안 한 항목) ─────────────
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
    p.cost_price
  having sum(si.quantity - si.inbound_qty - si.hold_qty) > 0
  order by sup.name nulls last, b.name, p.style_code, p.color_code;
$$;

grant execute on function get_inbound_pending(uuid) to service_role;

-- ── 매입 처리 RPC ───────────────────────────────────────────────────
-- 특정 (store, product) 의 ordered 미입고 sale_items 를 받아 부분 입고/보류 적용.
-- 오래된 sale_item 부터 우선 차감.
-- p_remainder_action: 'pending' (ordered_at 해제 → 주문대기) | 'hold' (hold_qty 증가)
drop function if exists mark_inbound_for_product(uuid, uuid, int, text, uuid);

create function mark_inbound_for_product(
  p_store_id uuid,
  p_product_id uuid,
  p_received_qty int,
  p_remainder_action text default 'pending', -- 'pending' | 'hold' | 'none'
  p_user_id uuid default null
)
returns table (
  product_id uuid,
  inbound_processed int,
  remainder_processed int,
  action text
)
language plpgsql
as $$
declare
  v_remaining_to_inbound int := greatest(p_received_qty, 0);
  v_total_unfulfilled int;
  v_total_remainder int;
  rec record;
begin
  -- 미입고 잔여 합계
  select coalesce(sum(quantity - inbound_qty - hold_qty), 0)::int
  into v_total_unfulfilled
  from fo_sale_items si
  join fo_sales sale on sale.id = si.sale_id
  where sale.store_id = p_store_id
    and si.product_id = p_product_id
    and si.ordered_at is not null
    and (si.quantity - si.inbound_qty - si.hold_qty) > 0;

  if v_remaining_to_inbound > v_total_unfulfilled then
    v_remaining_to_inbound := v_total_unfulfilled;
  end if;

  -- 입고 처리: 오래된 sale_item 부터
  for rec in
    select si.id, (si.quantity - si.inbound_qty - si.hold_qty) as avail
    from fo_sale_items si
    join fo_sales sale on sale.id = si.sale_id
    where sale.store_id = p_store_id
      and si.product_id = p_product_id
      and si.ordered_at is not null
      and (si.quantity - si.inbound_qty - si.hold_qty) > 0
    order by si.ordered_at asc, si.id asc
  loop
    exit when v_remaining_to_inbound <= 0;
    if rec.avail <= v_remaining_to_inbound then
      update fo_sale_items
      set inbound_qty = inbound_qty + rec.avail,
          inbound_at = now(),
          inbound_by_user_id = p_user_id
      where id = rec.id;
      v_remaining_to_inbound := v_remaining_to_inbound - rec.avail;
    else
      update fo_sale_items
      set inbound_qty = inbound_qty + v_remaining_to_inbound,
          inbound_at = now(),
          inbound_by_user_id = p_user_id
      where id = rec.id;
      v_remaining_to_inbound := 0;
    end if;
  end loop;

  -- 잔여 (received 보다 적게 와서 남은 수량) 처리
  v_total_remainder := v_total_unfulfilled - greatest(p_received_qty, 0);
  if v_total_remainder < 0 then v_total_remainder := 0; end if;

  if v_total_remainder > 0 and p_remainder_action in ('pending', 'hold') then
    -- 오래된 sale_item 부터 잔여 처리
    declare
      v_left int := v_total_remainder;
    begin
      for rec in
        select si.id, (si.quantity - si.inbound_qty - si.hold_qty) as avail
        from fo_sale_items si
        join fo_sales sale on sale.id = si.sale_id
        where sale.store_id = p_store_id
          and si.product_id = p_product_id
          and si.ordered_at is not null
          and (si.quantity - si.inbound_qty - si.hold_qty) > 0
        order by si.ordered_at asc, si.id asc
      loop
        exit when v_left <= 0;
        if p_remainder_action = 'hold' then
          if rec.avail <= v_left then
            update fo_sale_items
            set hold_qty = hold_qty + rec.avail
            where id = rec.id;
            v_left := v_left - rec.avail;
          else
            update fo_sale_items
            set hold_qty = hold_qty + v_left
            where id = rec.id;
            v_left := 0;
          end if;
        elsif p_remainder_action = 'pending' then
          -- ordered_at 해제 → 주문 대기로 복귀
          if rec.avail <= v_left then
            update fo_sale_items
            set ordered_at = null,
                ordered_by_user_id = null
            where id = rec.id;
            v_left := v_left - rec.avail;
          else
            -- 일부만 pending 으로 보내려면 sale_item 분할이 필요 → 단순화: 전체를 pending 으로 보냄
            update fo_sale_items
            set ordered_at = null,
                ordered_by_user_id = null
            where id = rec.id;
            v_left := 0;
          end if;
        end if;
      end loop;
    end;
  end if;

  return query select
    p_product_id,
    greatest(p_received_qty, 0) - 0,
    v_total_remainder,
    coalesce(p_remainder_action, 'none');
end;
$$;

grant execute on function mark_inbound_for_product(uuid, uuid, int, text, uuid) to service_role;

commit;
