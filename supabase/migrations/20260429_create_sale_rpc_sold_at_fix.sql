-- FRAME OPS Phase 2 — create_sale_with_items 오버로드 정리 + p_sold_at 추가
-- 이전 마이그레이션이 절반만 적용되어 같은 이름의 함수가 2개 등록된 상태를
-- 일괄 정리한 뒤 단일 시그니처로 재정의한다.
--   원인: CREATE OR REPLACE 는 시그니처가 다르면 새 함수를 만든다.
--         이후 GRANT EXECUTE 가 인자 없이 호출되어 모호성 오류 발생.

begin;

-- 1. public.create_sale_with_items 의 모든 오버로드 제거 (CASCADE: 관련 뷰/트리거 동시 정리)
do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'create_sale_with_items'
      and pronamespace = 'public'::regnamespace
  loop
    raise notice '제거: %', r.fn_sig;
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

-- 2. p_sold_at 포함된 단일 시그니처로 재정의
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
  v_sold_at timestamptz := coalesce(p_sold_at, now());
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
    p_store_id, v_sold_at, p_cash_amount, p_card_amount,
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

  update fo_products p
  set stock_quantity = p.stock_quantity - (item->>'quantity')::int
  from jsonb_array_elements(p_items) as item
  where p.id = (item->>'product_id')::uuid
    and p.stock_quantity is not null;

  return query
  select
    v_sale_id,
    v_sold_at,
    (p_cash_amount + p_card_amount - p_discount_total)::bigint,
    v_item_count;
end;
$$;

-- 3. GRANT 도 시그니처 명시 (모호성 방지)
grant execute on function create_sale_with_items(
  uuid, jsonb, int, int, int, text, uuid, text, text, text, text, timestamptz
) to service_role;

commit;
