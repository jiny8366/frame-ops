-- Frame Ops — Supabase RPC 함수
-- Supabase Dashboard > SQL Editor 에서 실행하거나 supabase db push 로 적용

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 고객 전체 정보 조회 (처방전 + 주문 이력 포함)
--    한 번의 RPC 호출로 N+1 문제 해결
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_customer_full_detail(p_customer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'customer',      row_to_json(c),
    'prescriptions', COALESCE(
      (SELECT json_agg(p ORDER BY p.created_at DESC)
       FROM fo_prescriptions p
       WHERE p.customer_id = p_customer_id),
      '[]'::json
    ),
    'orders',        COALESCE(
      (SELECT json_agg(
         json_build_object(
           'id',             o.id,
           'order_number',   o.order_number,
           'order_date',     o.order_date,
           'status',         o.status,
           'total_amount',   o.total_amount,
           'paid_amount',    o.paid_amount,
           'payment_method', o.payment_method,
           'items', COALESCE(
             (SELECT json_agg(
                json_build_object(
                  'id',              oi.id,
                  'product_code',    pr.product_code,
                  'style_code',      pr.style_code,
                  'color_code',      pr.color_code,
                  'display_name',    pr.display_name,
                  'quantity',        oi.quantity,
                  'unit_price',      oi.unit_price,
                  'total_price',     oi.total_price
                )
              )
              FROM fo_order_items oi
              JOIN fo_products pr ON pr.id = oi.product_id
              WHERE oi.order_id = o.id),
             '[]'::json
           )
         )
         ORDER BY o.order_date DESC
       )
       FROM fo_orders o
       WHERE o.customer_id = p_customer_id),
      '[]'::json
    )
  )
  INTO v_result
  FROM fo_customers c
  WHERE c.id = p_customer_id;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 스타일 코드 prefix 제품 검색 (POS 키패드 최적화)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_products_by_style_prefix(
  p_brand_id  UUID,
  p_prefix    TEXT,
  p_limit     INT DEFAULT 30
)
RETURNS SETOF fo_products
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM fo_products
  WHERE brand_id = p_brand_id
    AND is_active = TRUE
    AND style_code NOT LIKE '%:%'          -- 콜론 포함 제품 제외
    AND (p_prefix = '' OR style_code ILIKE p_prefix || '%')
  ORDER BY style_code
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 매장별 일매출 집계
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_daily_sales_summary(
  p_store_id   UUID,
  p_date_from  DATE,
  p_date_to    DATE
)
RETURNS TABLE (
  sale_date     DATE,
  order_count   BIGINT,
  total_amount  NUMERIC,
  paid_amount   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    o.order_date::DATE AS sale_date,
    COUNT(*)           AS order_count,
    SUM(o.total_amount) AS total_amount,
    SUM(o.paid_amount)  AS paid_amount
  FROM fo_orders o
  WHERE o.store_id = p_store_id
    AND o.status != 'cancelled'
    AND o.order_date::DATE BETWEEN p_date_from AND p_date_to
  GROUP BY o.order_date::DATE
  ORDER BY o.order_date::DATE;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 권한 부여 (anon 및 authenticated 역할에서 호출 가능하도록)
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_customer_full_detail(UUID)              TO authenticated;
GRANT EXECUTE ON FUNCTION search_products_by_style_prefix(UUID, TEXT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_daily_sales_summary(UUID, DATE, DATE)   TO authenticated;
