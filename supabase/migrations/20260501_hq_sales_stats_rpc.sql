-- FRAME OPS — 본사 통합 통계 RPC
-- p_store_id NULL → 전체 매장 합산. 단일 매장 → 그 매장만.
-- 응답: 기간 합계 + 월누적 + 매장별 분해 (전체일 때만)

begin;

drop function if exists get_hq_sales_stats(date, date, uuid);

create function get_hq_sales_stats(
  p_from date,
  p_to date,
  p_store_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_summary jsonb;
  v_month jsonb;
  v_by_store jsonb;
begin
  -- 기간 합계
  with period as (
    select
      coalesce(sum(s.cash_amount), 0)::bigint as cash,
      coalesce(sum(s.card_amount), 0)::bigint as card,
      coalesce(sum(s.cash_amount + s.card_amount - s.discount_total), 0)::bigint as revenue,
      count(*)::int as cnt,
      coalesce(sum(coalesce(items.qty, 0)), 0)::bigint as qty
    from fo_sales s
    left join lateral (
      select sum(si.quantity)::int as qty
      from fo_sale_items si
      where si.sale_id = s.id
    ) items on true
    where (p_store_id is null or s.store_id = p_store_id)
      and (s.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
  )
  select jsonb_build_object(
    'cash', cash,
    'card', card,
    'revenue', revenue,
    'count', cnt,
    'quantity', qty
  )
  into v_summary
  from period;

  -- 월누적 (p_to 가 속한 월의 1일 ~ p_to)
  with month_data as (
    select
      coalesce(sum(s.cash_amount), 0)::bigint as cash,
      coalesce(sum(s.card_amount), 0)::bigint as card,
      coalesce(sum(s.cash_amount + s.card_amount - s.discount_total), 0)::bigint as revenue,
      count(*)::int as cnt
    from fo_sales s
    where (p_store_id is null or s.store_id = p_store_id)
      and (s.sold_at at time zone 'Asia/Seoul')::date >= date_trunc('month', p_to::timestamp)::date
      and (s.sold_at at time zone 'Asia/Seoul')::date <= p_to
  )
  select jsonb_build_object(
    'cash', cash,
    'card', card,
    'revenue', revenue,
    'count', cnt
  )
  into v_month
  from month_data;

  -- 전체 매장 모드일 때만 매장별 분해
  if p_store_id is null then
    with by_store as (
      select
        st.id,
        st.store_code,
        st.name,
        coalesce(sum(s.cash_amount), 0)::bigint as cash,
        coalesce(sum(s.card_amount), 0)::bigint as card,
        coalesce(sum(s.cash_amount + s.card_amount - s.discount_total), 0)::bigint as revenue,
        count(s.id) filter (where s.id is not null)::int as cnt
      from fo_stores st
      left join fo_sales s on s.store_id = st.id
        and (s.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
      where st.active = true
      group by st.id, st.store_code, st.name
      order by revenue desc, st.store_code asc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'store_id', id,
      'store_code', store_code,
      'store_name', name,
      'cash', cash,
      'card', card,
      'revenue', revenue,
      'count', cnt
    )), '[]'::jsonb)
    into v_by_store
    from by_store;
  else
    v_by_store := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'store_id', p_store_id,
    'summary', v_summary,
    'month', v_month,
    'by_store', v_by_store
  );
end;
$$;

grant execute on function get_hq_sales_stats(date, date, uuid) to service_role, authenticated, anon;

commit;
