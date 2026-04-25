-- FRAME OPS — 정산/통계 RPC 의 일자 버킷팅을 KST(Asia/Seoul)로 통일
-- 기존: (sold_at at time zone 'UTC')::date  → 한국 영업일 기준이 어긋남
-- 수정: (sold_at at time zone 'Asia/Seoul')::date
-- 효과:
--   · 27일 새벽 02:00 KST 판매 → KST 캘린더 27일에 정확히 귀속 (이전: 26일 UTC 로 분류)
--   · 26일 정산 마감 후 27일 새벽 판매가 발생해도 27일 정산 마감 시 합산됨

begin;

-- ── 정산: 일일 요약 ────────────────────────────────────────────────────
drop function if exists get_daily_settlement_summary(uuid, date);

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
  select coalesce(s.cash_on_hand, 0)
  into v_starting_cash
  from fo_settlements s
  where s.store_id = p_store_id
    and s.business_date < p_business_date
  order by s.business_date desc
  limit 1;
  if v_starting_cash is null then v_starting_cash := 0; end if;

  select
    coalesce(sum(cash_amount), 0)::int,
    coalesce(sum(card_amount), 0)::int
  into v_cash_sales, v_card_sales
  from fo_sales
  where store_id = p_store_id
    and (sold_at at time zone 'Asia/Seoul')::date = p_business_date;

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
    v_settlement_id, v_starting_cash, v_cash_sales, v_card_sales, v_expense,
    v_cash_counted, v_cash_expected, v_variance, v_deposit, v_cash_on_hand,
    v_note, v_is_closed;
end;
$$;

grant execute on function get_daily_settlement_summary(uuid, date) to service_role;

-- ── 정산: 마감 ────────────────────────────────────────────────────────
drop function if exists close_daily_settlement(uuid, date, int, int, text, jsonb);

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
    and (sold_at at time zone 'Asia/Seoul')::date = p_business_date;

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
    v_settlement_id, v_cash_sales, v_card_sales, v_expense,
    v_cash_expected, v_variance, p_cash_counted;
end;
$$;

grant execute on function close_daily_settlement(uuid, date, int, int, text, jsonb) to service_role;

-- ── 정산: 월별 일자 리스트 ─────────────────────────────────────────────
drop function if exists get_monthly_settlement_list(uuid, text);

create function get_monthly_settlement_list(
  p_store_id uuid,
  p_year_month text
)
returns table (
  business_date date,
  sales_amount int,
  cash_amount int,
  card_amount int,
  sales_count int,
  expense int
)
language sql
stable
as $$
  with m as (
    select to_date(p_year_month || '-01', 'YYYY-MM-DD') as start_d
  ),
  s as (
    select
      (sold_at at time zone 'Asia/Seoul')::date as business_date,
      coalesce(sum(cash_amount), 0)::int as cash_amount,
      coalesce(sum(card_amount), 0)::int as card_amount,
      count(*)::int as sales_count
    from fo_sales, m
    where store_id = p_store_id
      and (sold_at at time zone 'Asia/Seoul')::date >= m.start_d
      and (sold_at at time zone 'Asia/Seoul')::date <  (m.start_d + interval '1 month')::date
    group by 1
  ),
  e as (
    select fs.business_date, fs.total_expense::int as expense
    from fo_settlements fs, m
    where fs.store_id = p_store_id
      and fs.business_date >= m.start_d
      and fs.business_date <  (m.start_d + interval '1 month')::date
  )
  select
    coalesce(s.business_date, e.business_date) as business_date,
    coalesce(s.cash_amount, 0) + coalesce(s.card_amount, 0) as sales_amount,
    coalesce(s.cash_amount, 0) as cash_amount,
    coalesce(s.card_amount, 0) as card_amount,
    coalesce(s.sales_count, 0) as sales_count,
    coalesce(e.expense, 0) as expense
  from s
  full outer join e on s.business_date = e.business_date
  order by 1 asc;
$$;

grant execute on function get_monthly_settlement_list(uuid, text) to service_role, authenticated, anon;

commit;
