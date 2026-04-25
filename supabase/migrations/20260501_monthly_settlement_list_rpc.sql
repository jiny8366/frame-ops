-- FRAME OPS — 월별 정산 리스트 RPC
-- 정산 페이지 우측 리스트(일자별 매출/현금/카드/건수/지출)용 집계.
-- 누계(running total)는 호출 측에서 계산.

begin;

do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'get_monthly_settlement_list'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function get_monthly_settlement_list(
  p_store_id uuid,
  p_year_month text  -- 'YYYY-MM'
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
      (sold_at at time zone 'UTC')::date as business_date,
      coalesce(sum(cash_amount), 0)::int as cash_amount,
      coalesce(sum(card_amount), 0)::int as card_amount,
      count(*)::int as sales_count
    from fo_sales, m
    where store_id = p_store_id
      and (sold_at at time zone 'UTC')::date >= m.start_d
      and (sold_at at time zone 'UTC')::date <  (m.start_d + interval '1 month')::date
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
