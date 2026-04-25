-- FRAME OPS Phase B3 — 일일 마감 RPC
-- 영업일자 기준 매출 자동 집계 + 지출 라인 + 시재 계산 + UPSERT 원자 처리.
--
-- 입력:
--   p_store_id, p_business_date, p_cash_counted, p_deposit, p_note
--   p_expenses: [{ amount, memo, sort_order? }]
--
-- 출력:
--   settlement_id, total_cash_sales, total_card_sales, total_expense, cash_expected, variance

begin;

-- 동명 함수 정리
do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname in ('close_daily_settlement', 'get_daily_settlement_summary')
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

-- ── GET: 영업일 기준 요약 (저장된 정산 + 매출 집계 + 직전 cash_on_hand) ──────
create function get_daily_settlement_summary(
  p_store_id uuid,
  p_business_date date
)
returns table (
  settlement_id uuid,
  starting_cash int,
  total_cash_sales int,
  total_card_sales int,
  total_expense int,
  cash_counted int,
  cash_expected int,
  variance int,
  deposit int,
  cash_on_hand int,
  note text,
  is_closed boolean
)
language plpgsql
stable
as $$
declare
  v_settlement_id uuid;
  v_starting_cash int := 0;
  v_cash_sales int := 0;
  v_card_sales int := 0;
  v_expense int := 0;
  v_cash_counted int;
  v_cash_expected int;
  v_variance int;
  v_deposit int := 0;
  v_cash_on_hand int := 0;
  v_note text;
  v_is_closed boolean := false;
begin
  -- 직전 영업일의 cash_on_hand → 오늘 시재(starting_cash)
  select coalesce(cash_on_hand, 0)
  into v_starting_cash
  from fo_settlements
  where store_id = p_store_id
    and business_date < p_business_date
  order by business_date desc
  limit 1;
  if v_starting_cash is null then v_starting_cash := 0; end if;

  -- 오늘 매출 집계 (fo_sales)
  select
    coalesce(sum(cash_amount), 0)::int,
    coalesce(sum(card_amount), 0)::int
  into v_cash_sales, v_card_sales
  from fo_sales
  where store_id = p_store_id
    and (sold_at at time zone 'UTC')::date = p_business_date;

  -- 기존 정산 존재 여부 + 값 로드
  select id, coalesce(cash_counted, 0), coalesce(cash_expected, 0), coalesce(variance, 0),
         coalesce(deposit, 0), coalesce(cash_on_hand, 0), note
  into v_settlement_id, v_cash_counted, v_cash_expected, v_variance, v_deposit, v_cash_on_hand, v_note
  from fo_settlements
  where store_id = p_store_id and business_date = p_business_date;

  if v_settlement_id is not null then
    v_is_closed := true;
    select coalesce(sum(amount), 0)::int into v_expense
    from fo_settlement_expenses
    where settlement_id = v_settlement_id;
  end if;

  return query select
    v_settlement_id,
    v_starting_cash,
    v_cash_sales,
    v_card_sales,
    v_expense,
    v_cash_counted,
    v_cash_expected,
    v_variance,
    v_deposit,
    v_cash_on_hand,
    v_note,
    v_is_closed;
end;
$$;

grant execute on function get_daily_settlement_summary(uuid, date) to service_role;

-- ── POST: 일일 마감 저장 (지출 + 시재 + 본사입금 → UPSERT) ─────────────────
create function close_daily_settlement(
  p_store_id uuid,
  p_business_date date,
  p_cash_counted int,
  p_deposit int default 0,
  p_note text default null,
  p_expenses jsonb default '[]'::jsonb
)
returns table (
  settlement_id uuid,
  total_cash_sales int,
  total_card_sales int,
  total_expense int,
  cash_expected int,
  variance int,
  cash_on_hand int
)
language plpgsql
as $$
declare
  v_settlement_id uuid;
  v_starting_cash int := 0;
  v_cash_sales int := 0;
  v_card_sales int := 0;
  v_expense int := 0;
  v_cash_expected int;
  v_variance int;
begin
  -- 시작 시재
  select coalesce(cash_on_hand, 0)
  into v_starting_cash
  from fo_settlements
  where store_id = p_store_id and business_date < p_business_date
  order by business_date desc
  limit 1;
  if v_starting_cash is null then v_starting_cash := 0; end if;

  -- 매출 집계
  select
    coalesce(sum(cash_amount), 0)::int,
    coalesce(sum(card_amount), 0)::int
  into v_cash_sales, v_card_sales
  from fo_sales
  where store_id = p_store_id
    and (sold_at at time zone 'UTC')::date = p_business_date;

  -- 지출 합계
  select coalesce(sum((e->>'amount')::int), 0)::int
  into v_expense
  from jsonb_array_elements(p_expenses) as e;

  -- 예상 현금 / 차액
  v_cash_expected := v_starting_cash + v_cash_sales - v_expense - coalesce(p_deposit, 0);
  v_variance := p_cash_counted - v_cash_expected;

  -- UPSERT 정산
  insert into fo_settlements (
    store_id, business_date, cash_on_hand, card_sales,
    cash_counted, cash_expected, variance, total_expense,
    deposit, note
  ) values (
    p_store_id, p_business_date, p_cash_counted, v_card_sales,
    p_cash_counted, v_cash_expected, v_variance, v_expense,
    coalesce(p_deposit, 0), p_note
  )
  on conflict (store_id, business_date) do update set
    cash_on_hand = excluded.cash_on_hand,
    card_sales = excluded.card_sales,
    cash_counted = excluded.cash_counted,
    cash_expected = excluded.cash_expected,
    variance = excluded.variance,
    total_expense = excluded.total_expense,
    deposit = excluded.deposit,
    note = excluded.note
  returning id into v_settlement_id;

  -- 지출 라인 교체 (idempotent)
  delete from fo_settlement_expenses where settlement_id = v_settlement_id;

  insert into fo_settlement_expenses (settlement_id, amount, memo, sort_order)
  select
    v_settlement_id,
    (e->>'amount')::int,
    e->>'memo',
    coalesce((e->>'sort_order')::int, ord::int)
  from jsonb_array_elements(p_expenses) with ordinality as t(e, ord);

  return query select
    v_settlement_id,
    v_cash_sales,
    v_card_sales,
    v_expense,
    v_cash_expected,
    v_variance,
    p_cash_counted;
end;
$$;

grant execute on function close_daily_settlement(uuid, date, int, int, text, jsonb) to service_role;

commit;
