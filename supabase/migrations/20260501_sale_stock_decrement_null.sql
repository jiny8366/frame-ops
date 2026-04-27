-- FRAME OPS — 판매 시 재고 차감을 NULL 도 포함하도록 수정
-- 기존: stock_quantity NULL 인 제품은 차감 안 함 → 영원히 NULL.
-- 변경: NULL 은 0 으로 간주(coalesce) 후 차감 → 음수 허용 (매입 대기).

begin;

-- 시그니처 충돌 회피 — 기존 함수 모두 drop
do $cleanup$
declare r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'create_sale_with_items'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function create_sale_with_items(
  p_store_id uuid,
  p_items jsonb,
  p_cash_amount int,
  p_card_amount int,
  p_discount_total int,
  p_discount_type_code text default null,
  p_seller_user_id uuid default null,
  p_seller_code text default null,
  p_seller_label text default null,
  p_clerk_note text default null,
  p_idempotency_key text default null,
  p_sold_at timestamptz default null
)
returns table (
  sale_id uuid,
  sold_at timestamptz,
  total_amount bigint,
  items_created int
)
language plpgsql
as $$
declare
  v_sale_id uuid;
  v_existing_sale_id uuid;
  v_item_count int;
begin
  if p_idempotency_key is not null then
    select id into v_existing_sale_id
    from fo_sales
    where idempotency_key = p_idempotency_key;

    if v_existing_sale_id is not null then
      return query
      select
        s.id,
        s.sold_at,
        (s.cash_amount + s.card_amount - s.discount_total)::bigint,
        (select count(*)::int from fo_sale_items where sale_id = s.id)
      from fo_sales s
      where s.id = v_existing_sale_id;
      return;
    end if;
  end if;

  insert into fo_sales (
    store_id, sold_at, cash_amount, card_amount,
    discount_total, discount_type_code,
    seller_user_id, seller_code, seller_label,
    clerk_note, idempotency_key
  ) values (
    p_store_id, coalesce(p_sold_at, now()), p_cash_amount, p_card_amount,
    p_discount_total, p_discount_type_code,
    p_seller_user_id, p_seller_code, p_seller_label,
    p_clerk_note, p_idempotency_key
  )
  returning id into v_sale_id;

  insert into fo_sale_items (
    sale_id, product_id, quantity, unit_price, discount_amount
  )
  select
    v_sale_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::int,
    (item->>'unit_price')::int,
    coalesce((item->>'discount_amount')::int, 0)
  from jsonb_array_elements(p_items) as item;

  get diagnostics v_item_count = row_count;

  -- 재고 차감 — NULL 은 0 으로 간주, 결과는 음수 허용 (매입 대기).
  update fo_products p
  set stock_quantity = coalesce(p.stock_quantity, 0) - (item->>'quantity')::int
  from jsonb_array_elements(p_items) as item
  where p.id = (item->>'product_id')::uuid;

  return query
  select
    v_sale_id,
    coalesce(p_sold_at, now())::timestamptz,
    (p_cash_amount + p_card_amount - p_discount_total)::bigint,
    v_item_count;
end;
$$;

grant execute on function create_sale_with_items to service_role;

comment on function create_sale_with_items is
  'POS 결제 원자적 처리: fo_sales + fo_sale_items 삽입 + stock_quantity 차감(NULL→0, 음수 허용).';

commit;
