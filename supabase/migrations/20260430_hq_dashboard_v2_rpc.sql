-- FRAME OPS — 본사 대시보드 v2 RPC
-- 출력: summary(매출/매입/이익) + hourly(9~21시) + products(판매 상품 리스트)
-- 매장 필터 (p_store_id=null → 전 매장 합산)

begin;

do $cleanup$
declare r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'get_hq_dashboard_v2'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function get_hq_dashboard_v2(
  p_store_id uuid default null,
  p_date date default current_date
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_summary jsonb;
  v_hourly jsonb;
  v_products jsonb;
begin
  -- ── 1. 요약 (매출/매입/이익/건수/수량) ─────────────────────────────────
  with sale_lines as (
    select
      s.id as sale_id,
      si.quantity::int as qty,
      (si.quantity * si.unit_price - si.discount_amount)::bigint as line_revenue,
      (si.quantity * coalesce(p.cost_price, 0))::bigint as line_cost
    from fo_sales s
    inner join fo_sale_items si on si.sale_id = s.id
    inner join fo_products p on p.id = si.product_id
    where (p_store_id is null or s.store_id = p_store_id)
      and (s.sold_at at time zone 'UTC')::date = p_date
  )
  select jsonb_build_object(
    'revenue', coalesce(sum(line_revenue), 0)::bigint,
    'cost', coalesce(sum(line_cost), 0)::bigint,
    'profit', coalesce(sum(line_revenue) - sum(line_cost), 0)::bigint,
    'sale_count', count(distinct sale_id)::int,
    'item_count', coalesce(sum(qty), 0)::int
  )
  into v_summary
  from sale_lines;

  -- ── 2. 시간대별 (오전 9시 ~ 오후 9시) ────────────────────────────────────
  with hours as (select generate_series(9, 21) as hour),
  agg as (
    select
      extract(hour from (s.sold_at at time zone 'UTC'))::int as h,
      sum(si.quantity * si.unit_price - si.discount_amount)::bigint as revenue,
      sum(si.quantity)::int as qty
    from fo_sales s
    inner join fo_sale_items si on si.sale_id = s.id
    where (p_store_id is null or s.store_id = p_store_id)
      and (s.sold_at at time zone 'UTC')::date = p_date
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'hour', h.hour,
    'revenue', coalesce(agg.revenue, 0),
    'qty', coalesce(agg.qty, 0)
  ) order by h.hour), '[]'::jsonb)
  into v_hourly
  from hours h
  left join agg on agg.h = h.hour;

  -- ── 3. 판매 상품 리스트 (수량 내림차순) ─────────────────────────────────
  select coalesce(jsonb_agg(row_to_json(t.*)), '[]'::jsonb)
  into v_products
  from (
    select
      p.id as product_id,
      coalesce(b.name, '') as brand_name,
      p.style_code,
      p.color_code,
      sum(si.quantity)::int as quantity,
      sum(si.quantity * si.unit_price - si.discount_amount)::bigint as revenue
    from fo_sales s
    inner join fo_sale_items si on si.sale_id = s.id
    inner join fo_products p on p.id = si.product_id
    left join fo_brands b on b.id = p.brand_id
    where (p_store_id is null or s.store_id = p_store_id)
      and (s.sold_at at time zone 'UTC')::date = p_date
    group by p.id, b.name, p.style_code, p.color_code
    order by sum(si.quantity) desc, sum(si.quantity * si.unit_price - si.discount_amount) desc
  ) t;

  return jsonb_build_object(
    'summary', v_summary,
    'hourly', v_hourly,
    'products', v_products
  );
end;
$$;

grant execute on function get_hq_dashboard_v2(uuid, date) to service_role;

commit;
