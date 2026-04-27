-- FRAME OPS — fo_sales.seller_user_id FK 재정렬: auth.users → fo_staff_profiles
--
-- 배경:
--   2026-04-22 마이그레이션에서 fo_sales.seller_user_id 가 auth.users(id) 를
--   참조하도록 정의됨. 그러나 2026-04-29 마이그레이션에서 fo_staff_profiles 가
--   auth.users 와 분리(자체 user_id UUID 발급) 되면서, POS 결제 시 사용되는
--   staff_user_id 는 fo_staff_profiles.user_id 이고 auth.users 에는 존재하지 않음.
--   결과: 모든 판매가 FK 위반으로 실패 → sync_queue 에 100+ 회 누적.
--
-- 해결:
--   1) 기존 FK (auth.users 참조) 제거
--   2) 정합성 확보 — fo_staff_profiles 에 없는 seller_user_id 는 NULL 로 정리
--   3) 신규 FK 추가 — fo_staff_profiles.user_id 참조, on delete set null
--   4) create_sale_with_items RPC 의 사전 검증을 fo_staff_profiles 로 전환
--
-- seller_label 스냅샷은 그대로 유지하므로 직원 삭제 시에도 표시 정보 보존.

begin;

-- 1) 기존 FK 제거
alter table public.fo_sales
  drop constraint if exists fo_sales_seller_user_id_fkey;

-- 2) fo_staff_profiles 에 없는 고아 seller_user_id 정리 (FK 추가 전 정합성)
update public.fo_sales s
set seller_user_id = null
where seller_user_id is not null
  and not exists (
    select 1 from public.fo_staff_profiles p
    where p.user_id = s.seller_user_id
  );

-- 3) 신규 FK — fo_staff_profiles 참조
alter table public.fo_sales
  add constraint fo_sales_seller_user_id_fkey
  foreign key (seller_user_id)
  references public.fo_staff_profiles (user_id)
  on delete set null;

-- 4) RPC 의 graceful 검증 대상도 fo_staff_profiles 로 전환
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
  -- seller_user_id 가 fo_staff_profiles 에 없으면 NULL 로 graceful degrade.
  -- (직원 삭제 또는 ID 불일치 시에도 판매 데이터는 보존; seller_label 스냅샷이 표시 정보 유지)
  if p_seller_user_id is not null then
    select user_id into v_validated_seller_user_id
    from fo_staff_profiles
    where user_id = p_seller_user_id;

    if v_validated_seller_user_id is null then
      raise notice 'create_sale_with_items: seller_user_id % 가 fo_staff_profiles 에 없음 — NULL 로 처리 (seller_label=%)',
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
