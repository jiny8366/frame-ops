-- FRAME OPS — 정산 RPC 컬럼 모호성(ambiguous) 오류 수정
--
-- get_daily_settlement_summary / close_daily_settlement 의 RETURNS TABLE 컬럼명이
-- fo_settlements 의 실제 컬럼과 동일해 (cash_on_hand, cash_counted, cash_expected,
-- variance, deposit, note) 함수 본문 SELECT 안에서 "column reference is ambiguous"
-- 오류 발생. `#variable_conflict use_column` 지시자 + 테이블 별칭으로 명시 해결.

begin;

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

-- ── GET: 영업일 기준 요약 ───────────────────────────────────────────────
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
#variable_conflict use_column
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
  -- 직전 영업일의 cash_on_hand → 오늘 시작 시재
  select coalesce(s.cash_on_hand, 0)
  into v_starting_cash
  from fo_settlements s
  where s.store_id = p_store_id
    and s.business_date < p_business_date
  order by s.business_date desc
  limit 1;
  if v_starting_cash is null then v_starting_cash := 0; end if;

  -- 오늘 매출 집계
  select
    coalesce(sum(cash_amount), 0)::int,
    coalesce(sum(card_amount), 0)::int
  into v_cash_sales, v_card_sales
  from fo_sales
  where store_id = p_store_id
    and (sold_at at time zone 'UTC')::date = p_business_date;

  -- 기존 정산 로드
  select s.id, coalesce(s.cash_counted, 0), coalesce(s.cash_expected, 0),
         coalesce(s.variance, 0), coalesce(s.deposit, 0),
         coalesce(s.cash_on_hand, 0), s.note
  into v_settlement_id, v_cash_counted, v_cash_expected, v_variance,
       v_deposit, v_cash_on_hand, v_note
  from fo_settlements s
  where s.store_id = p_store_id and s.business_date = p_business_date;

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

-- ── POST: 일일 마감 저장 ────────────────────────────────────────────────
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
#variable_conflict use_column
declare
  v_settlement_id uuid;
  v_starting_cash int := 0;
  v_cash_sales int := 0;
  v_card_sales int := 0;
  v_expense int := 0;
  v_cash_expected int;
  v_variance int;
begin
  select coalesce(s.cash_on_hand, 0)
  into v_starting_cash
  from fo_settlements s
  where s.store_id = p_store_id and s.business_date < p_business_date
  order by s.business_date desc
  limit 1;
  if v_starting_cash is null then v_starting_cash := 0; end if;

  select
    coalesce(sum(cash_amount), 0)::int,
    coalesce(sum(card_amount), 0)::int
  into v_cash_sales, v_card_sales
  from fo_sales
  where store_id = p_store_id
    and (sold_at at time zone 'UTC')::date = p_business_date;

  select coalesce(sum((e->>'amount')::int), 0)::int
  into v_expense
  from jsonb_array_elements(p_expenses) as e;

  v_cash_expected := v_starting_cash + v_cash_sales - v_expense - coalesce(p_deposit, 0);
  v_variance := p_cash_counted - v_cash_expected;

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
