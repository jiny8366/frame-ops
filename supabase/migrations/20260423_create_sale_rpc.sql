-- FRAME OPS Phase 2 — create_sale_with_items RPC
-- 판매 + 품목 + 재고 차감 원자적 처리. idempotency_key 로 중복 결제 방지.
-- 참고: PHASE2_WORK_ORDER_FINAL.md TASK 6-A
-- 선행 조건: 20260423_add_sale_items_and_stock.sql (fo_sale_items + stock_quantity) 적용 완료.

begin;

create or replace function create_sale_with_items(
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
  p_idempotency_key text default null
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
  -- Idempotency 체크 — 동일 키 재전송 시 기존 sale 을 그대로 반환
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

  -- 판매 레코드 생성
  insert into fo_sales (
    store_id, sold_at, cash_amount, card_amount,
    discount_total, discount_type_code,
    seller_user_id, seller_code, seller_label,
    clerk_note, idempotency_key
  ) values (
    p_store_id, now(), p_cash_amount, p_card_amount,
    p_discount_total, p_discount_type_code,
    p_seller_user_id, p_seller_code, p_seller_label,
    p_clerk_note, p_idempotency_key
  )
  returning id into v_sale_id;

  -- 품목 일괄 삽입
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

  -- 재고 차감 (stock_quantity 가 NULL 이 아닌 제품만)
  -- ⚠️ 안경원 실무: 음수로 떨어져도 OK (매입 대기 = 발주 필요 건수)
  update fo_products p
  set stock_quantity = p.stock_quantity - (item->>'quantity')::int
  from jsonb_array_elements(p_items) as item
  where p.id = (item->>'product_id')::uuid
    and p.stock_quantity is not null;

  return query
  select
    v_sale_id,
    now()::timestamptz,
    (p_cash_amount + p_card_amount - p_discount_total)::bigint,
    v_item_count;
end;
$$;

grant execute on function create_sale_with_items to service_role;

comment on function create_sale_with_items is
  'POS 결제 원자적 처리: fo_sales 삽입 + fo_sale_items 일괄 삽입 + fo_products.stock_quantity 차감. '
  'idempotency_key 로 중복 전송 방지. 재고 음수 허용(매입 대기).';

commit;
