-- FRAME OPS — 본사 대시보드 RPC (rolling 12h 모드)
-- 시간대별 매출·수량을 현재 시점 기준 직전 12시간으로 보여줌 (날짜 지정 없음).
-- 요약·판매 상품 리스트도 동일 12시간 윈도우 기준.

begin;

do $cleanup$
declare r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'get_hq_dashboard_v3'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function get_hq_dashboard_v3(
  p_store_id uuid default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_summary jsonb;
  v_hourly jsonb;
  v_products jsonb;
  v_now timestamptz := now();
  v_start timestamptz := v_now - interval '12 hours';
begin
  -- ── 요약 (직전 12 시간) ─────────────────────────────────────────────
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
      and s.sold_at >= v_start
      and s.sold_at <= v_now
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

  -- ── 시간대별 (직전 12 시간 buckets) ──────────────────────────────────
  with hour_buckets as (
    select generate_series(
      date_trunc('hour', v_start),
      date_trunc('hour', v_now),
      interval '1 hour'
    ) as bucket_start
  ),
  agg as (
    select
      date_trunc('hour', s.sold_at) as bucket_start,
      sum(si.quantity * si.unit_price - si.discount_amount)::bigint as revenue,
      sum(si.quantity)::int as qty
    from fo_sales s
    inner join fo_sale_items si on si.sale_id = s.id
    where (p_store_id is null or s.store_id = p_store_id)
      and s.sold_at >= v_start
      and s.sold_at <= v_now
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'hour', extract(hour from h.bucket_start)::int,
    'label', to_char(h.bucket_start, 'HH24') || '시',
    'revenue', coalesce(agg.revenue, 0),
    'qty', coalesce(agg.qty, 0)
  ) order by h.bucket_start), '[]'::jsonb)
  into v_hourly
  from hour_buckets h
  left join agg on agg.bucket_start = h.bucket_start;

  -- ── 판매 상품 리스트 (직전 12 시간, 수량 desc) ──────────────────────
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
      and s.sold_at >= v_start
      and s.sold_at <= v_now
    group by p.id, b.name, p.style_code, p.color_code
    order by sum(si.quantity) desc, sum(si.quantity * si.unit_price - si.discount_amount) desc
  ) t;

  return jsonb_build_object(
    'summary', v_summary,
    'hourly', v_hourly,
    'products', v_products,
    'window_start', v_start,
    'window_end', v_now
  );
end;
$$;

grant execute on function get_hq_dashboard_v3(uuid) to service_role;

commit;
