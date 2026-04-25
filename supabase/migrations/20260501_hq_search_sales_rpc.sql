-- FRAME OPS — 본사 판매내역 검색 RPC
-- 기간 + 제품 키워드 + 매장 필터 (NULL = 전체) → 매장명 포함

begin;

drop function if exists search_hq_sales(date, date, text, uuid, int);

create function search_hq_sales(
  p_from date,
  p_to date,
  p_query text default null,
  p_store_id uuid default null,
  p_limit int default 200
)
returns table (
  sale_id uuid,
  sold_at timestamptz,
  store_id uuid,
  store_code text,
  store_name text,
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
    s.store_id,
    st.store_code,
    st.name as store_name,
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
  join fo_stores st on st.id = s.store_id
  left join fo_staff_profiles sp on sp.user_id = s.seller_user_id
  where (s.sold_at at time zone 'Asia/Seoul')::date between p_from and p_to
    and (p_store_id is null or s.store_id = p_store_id)
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

grant execute on function search_hq_sales(date, date, text, uuid, int) to service_role, authenticated, anon;

commit;
