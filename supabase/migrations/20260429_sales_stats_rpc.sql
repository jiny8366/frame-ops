-- FRAME OPS Phase C — 판매통계 + 판매내역 검색 RPC
-- 1. get_sales_stats — 기간 합계 + 월누적
-- 2. get_top_products — 기간 내 상품별 매출 합계
-- 3. search_sales — 기간 + 상품 키워드 필터로 판매 행 + 담당자 + 항목 요약

begin;

do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname in ('get_sales_stats', 'get_top_products', 'search_sales')
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

-- ── 기간 합계 + 월누적 ─────────────────────────────────────────────────
create function get_sales_stats(
  p_store_id uuid,
  p_from date,
  p_to date
)
returns table (
  period_cash bigint,
  period_card bigint,
  period_revenue bigint,
  period_count int,
  month_cash bigint,
  month_card bigint,
  month_revenue bigint
)
language sql
stable
as $$
  with period as (
    select
      coalesce(sum(cash_amount), 0)::bigint as cash,
      coalesce(sum(card_amount), 0)::bigint as card,
      coalesce(sum(cash_amount + card_amount - discount_total), 0)::bigint as revenue,
      count(*)::int as cnt
    from fo_sales
    where store_id = p_store_id
      and (sold_at at time zone 'UTC')::date between p_from and p_to
  ),
  month as (
    select
      coalesce(sum(cash_amount), 0)::bigint as cash,
      coalesce(sum(card_amount), 0)::bigint as card,
      coalesce(sum(cash_amount + card_amount - discount_total), 0)::bigint as revenue
    from fo_sales
    where store_id = p_store_id
      and (sold_at at time zone 'UTC')::date >= date_trunc('month', p_to::timestamp)::date
      and (sold_at at time zone 'UTC')::date <= p_to
  )
  select
    period.cash, period.card, period.revenue, period.cnt,
    month.cash, month.card, month.revenue
  from period, month;
$$;

grant execute on function get_sales_stats(uuid, date, date) to service_role;

-- ── 기간 내 상품별 매출 ──────────────────────────────────────────────────
create function get_top_products(
  p_store_id uuid,
  p_from date,
  p_to date,
  p_limit int default 50
)
returns table (
  product_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  total_quantity int,
  total_revenue bigint
)
language sql
stable
as $$
  select
    p.id as product_id,
    b.name as brand_name,
    p.style_code,
    p.color_code,
    p.display_name,
    sum(si.quantity)::int as total_quantity,
    sum(si.quantity * si.unit_price - si.discount_amount)::bigint as total_revenue
  from fo_sale_items si
  join fo_sales s on s.id = si.sale_id
  join fo_products p on p.id = si.product_id
  left join fo_brands b on b.id = p.brand_id
  where s.store_id = p_store_id
    and (s.sold_at at time zone 'UTC')::date between p_from and p_to
  group by p.id, b.name, p.style_code, p.color_code, p.display_name
  order by total_quantity desc, total_revenue desc
  limit greatest(p_limit, 1);
$$;

grant execute on function get_top_products(uuid, date, date, int) to service_role;

-- ── 판매내역 검색 ──────────────────────────────────────────────────────
-- p_query 가 있으면 fo_sale_items 조인하여 style_code/display_name 매치된 sale 만.
create function search_sales(
  p_store_id uuid,
  p_from date,
  p_to date,
  p_query text default null,
  p_limit int default 200
)
returns table (
  sale_id uuid,
  sold_at timestamptz,
  cash_amount int,
  card_amount int,
  discount_total int,
  total_amount bigint,
  payment_method text,
  seller_user_id uuid,
  seller_name text,
  item_count int,
  items_summary text
)
language sql
stable
as $$
  select
    s.id as sale_id,
    s.sold_at,
    s.cash_amount,
    s.card_amount,
    s.discount_total,
    (s.cash_amount + s.card_amount - s.discount_total)::bigint as total_amount,
    case
      when s.cash_amount > 0 and s.card_amount > 0 then '혼합'
      when s.card_amount > 0 then '카드'
      when s.cash_amount > 0 then '현금'
      else '-'
    end as payment_method,
    s.seller_user_id,
    coalesce(sp.display_name, s.seller_label) as seller_name,
    (select count(*)::int from fo_sale_items where sale_id = s.id) as item_count,
    (
      select string_agg(
        coalesce(p.style_code, '—') ||
        case when p.color_code is not null then ' / ' || p.color_code else '' end ||
        ' x ' || si.quantity::text,
        ', '
        order by si.id
      )
      from fo_sale_items si
      join fo_products p on p.id = si.product_id
      where si.sale_id = s.id
    ) as items_summary
  from fo_sales s
  left join fo_staff_profiles sp on sp.user_id = s.seller_user_id
  where s.store_id = p_store_id
    and (s.sold_at at time zone 'UTC')::date between p_from and p_to
    and (
      p_query is null
      or p_query = ''
      or exists (
        select 1
        from fo_sale_items si
        join fo_products p on p.id = si.product_id
        where si.sale_id = s.id
          and (
            p.style_code ilike '%' || p_query || '%'
            or p.display_name ilike '%' || p_query || '%'
            or p.color_code ilike '%' || p_query || '%'
          )
      )
    )
  order by s.sold_at desc
  limit greatest(p_limit, 1);
$$;

grant execute on function search_sales(uuid, date, date, text, int) to service_role;

commit;
