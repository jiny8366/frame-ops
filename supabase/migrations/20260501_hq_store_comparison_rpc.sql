-- FRAME OPS — 매장 비교 RPC
-- 기간 내 매장별 KPI (매출, 현금, 카드, 건수, 점수, 평균객단가) 한 번에 반환.

begin;

drop function if exists get_hq_store_comparison(date, date);

create function get_hq_store_comparison(
  p_from date,
  p_to date
)
returns table (
  store_id uuid,
  store_code text,
  store_name text,
  revenue bigint,
  cash bigint,
  card bigint,
  sale_count int,
  item_quantity int,
  avg_ticket bigint
)
language sql
stable
as $$
  with sales as (
    select
      s.store_id,
      s.id as sale_id,
      s.cash_amount,
      s.card_amount,
      s.discount_total
    from fo_sales s
    where (s.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
  ),
  qty as (
    select
      s.store_id,
      sum(si.quantity)::int as q
    from fo_sales s
    join fo_sale_items si on si.sale_id = s.id
    where (s.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
    group by s.store_id
  )
  select
    st.id as store_id,
    st.store_code,
    st.name as store_name,
    coalesce(sum(s.cash_amount + s.card_amount - s.discount_total), 0)::bigint as revenue,
    coalesce(sum(s.cash_amount), 0)::bigint as cash,
    coalesce(sum(s.card_amount), 0)::bigint as card,
    count(s.sale_id)::int as sale_count,
    coalesce(qty.q, 0) as item_quantity,
    case
      when count(s.sale_id) = 0 then 0
      else (coalesce(sum(s.cash_amount + s.card_amount - s.discount_total), 0)::bigint / count(s.sale_id))
    end as avg_ticket
  from fo_stores st
  left join sales s on s.store_id = st.id
  left join qty on qty.store_id = st.id
  where st.active = true
  group by st.id, st.store_code, st.name, qty.q
  order by revenue desc, st.store_code asc;
$$;

grant execute on function get_hq_store_comparison(date, date) to service_role, authenticated, anon;

commit;
