-- FRAME OPS — create_sale_with_items: seller_user_id graceful degradation
--
-- 문제: 직원 계정 삭제, ID 불일치, 마이그레이션 잔재 등으로 fo_sales.seller_user_id
--       FK(auth.users.id) 위반이 발생하여 sync_queue 항목이 무한 재시도 정체.
--       (실관측: retry_count 100+ 회 동일 오류 반복)
--
-- 해결: RPC 진입 시 seller_user_id 가 auth.users 에 존재하는지 검증.
--       없으면 NULL 로 대체하여 insert 성공시킨다 (column 은 nullable + FK on delete set null).
--       seller_label 스냅샷이 표시 정보를 보존하므로 통계/UI 영향 없음.

begin;

drop function if exists create_sale_with_items(
  uuid, jsonb, int, int, int, text, uuid, text, text, text, text, timestamptz
);

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
  v_validated_seller_user_id uuid;
begin
  -- seller_user_id graceful degradation: auth.users 에 존재하지 않으면 NULL.
  if p_seller_user_id is not null then
    select id into v_validated_seller_user_id
    from auth.users
    where id = p_seller_user_id;

    if v_validated_seller_user_id is null then
      raise notice 'create_sale_with_items: seller_user_id % 가 auth.users 에 없음 — NULL 로 처리 (seller_label=%)',
        p_seller_user_id, p_seller_label;
    end if;
  end if;

  -- 멱등 처리: 동일 idempotency_key 재호출 시 기존 sale 반환.
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
    v_validated_seller_user_id, p_seller_code, p_seller_label,
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
  set stock_quantity = coalesce(p.stock_quantity, 0) - (item->>'quantity')::int
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

grant execute on function create_sale_with_items(
  uuid, jsonb, int, int, int, text, uuid, text, text, text, text, timestamptz
) to service_role;

commit;
