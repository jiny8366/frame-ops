-- Frame Ops — 매출 정의 통일: revenue = cash + card (받은 돈)
--
-- 배경:
--   사용자 제보 — 판매통계 매출(₩770,000) ≠ 정산 매출(₩785,000), 차이 ₩15,000 = 그날 할인 합.
--
-- 근본 원인 (할인 이중 차감):
--   fo_sales.cash_amount + card_amount 는 이미 "할인이 적용된 후 고객이 실제로 지불한 금액".
--   그런데 get_sales_stats / get_hq_sales_stats RPC 는
--     revenue = sum(cash_amount + card_amount − discount_total)
--   로 계산하여 할인을 두 번 빼고 있었음.
--
-- 정정:
--   revenue = sum(cash_amount + card_amount)  ← 받은 돈 (할인 후, net)
--
-- 영향 받는 화면:
--   - /admin/stats  (판매통계)  — 본 마이그레이션으로 정확해짐
--   - /hq/stats     (본사 통계)  — 본 마이그레이션으로 정확해짐
--   - /hq/dashboard (대시보드)   — get_hq_dashboard_v3 는 라인 net 합산이라 이미 정확 (변경 없음)
--   - /admin/settlement (정산)   — cash, card 각각 노출만 하므로 이미 정확
--
-- 또한 API 코드에서 추가 방어선으로 'revenue = cash + card' 를 응답 직전 강제 (별도 PR).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_sales_stats — revenue 정정
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_sales_stats(uuid, date, date);

CREATE FUNCTION get_sales_stats(
  p_store_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  period_cash bigint,
  period_card bigint,
  period_revenue bigint,
  period_count int,
  month_cash bigint,
  month_card bigint,
  month_revenue bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH period AS (
    SELECT
      COALESCE(SUM(cash_amount), 0)::bigint AS cash,
      COALESCE(SUM(card_amount), 0)::bigint AS card,
      -- ⓘ revenue = 받은 돈 (할인 후). cash + card 자체가 이미 할인 후 결제액.
      COALESCE(SUM(cash_amount + card_amount), 0)::bigint AS revenue,
      COUNT(*)::int AS cnt
    FROM fo_sales
    WHERE store_id = p_store_id
      AND (sold_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
  ),
  month_data AS (
    SELECT
      COALESCE(SUM(cash_amount), 0)::bigint AS cash,
      COALESCE(SUM(card_amount), 0)::bigint AS card,
      COALESCE(SUM(cash_amount + card_amount), 0)::bigint AS revenue
    FROM fo_sales
    WHERE store_id = p_store_id
      AND (sold_at AT TIME ZONE 'Asia/Seoul')::date >= date_trunc('month', p_to::timestamp)::date
      AND (sold_at AT TIME ZONE 'Asia/Seoul')::date <= p_to
  )
  SELECT
    period.cash, period.card, period.revenue, period.cnt,
    month_data.cash, month_data.card, month_data.revenue
  FROM period, month_data;
$$;

GRANT EXECUTE ON FUNCTION get_sales_stats(uuid, date, date) TO service_role, authenticated, anon;

COMMENT ON FUNCTION get_sales_stats IS
  '판매통계 RPC. revenue = sum(cash + card) — 받은 돈 (할인 후). discount_total 은 이미 cash/card 에 반영된 상태이므로 다시 빼지 않음.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_hq_sales_stats — 동일 정정
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_hq_sales_stats(date, date, uuid);

CREATE FUNCTION get_hq_sales_stats(
  p_from date,
  p_to date,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_summary jsonb;
  v_month jsonb;
  v_by_store jsonb;
BEGIN
  -- 기간 합계 — revenue = sum(cash + card)
  WITH period AS (
    SELECT
      COALESCE(SUM(s.cash_amount), 0)::bigint AS cash,
      COALESCE(SUM(s.card_amount), 0)::bigint AS card,
      COALESCE(SUM(s.cash_amount + s.card_amount), 0)::bigint AS revenue,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(COALESCE(items.qty, 0)), 0)::bigint AS qty
    FROM fo_sales s
    LEFT JOIN LATERAL (
      SELECT SUM(si.quantity)::int AS qty
      FROM fo_sale_items si
      WHERE si.sale_id = s.id
    ) items ON TRUE
    WHERE (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (s.sold_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'cash', cash,
    'card', card,
    'revenue', revenue,
    'count', cnt,
    'quantity', qty
  )
  INTO v_summary
  FROM period;

  -- 월누적
  WITH month_data AS (
    SELECT
      COALESCE(SUM(s.cash_amount), 0)::bigint AS cash,
      COALESCE(SUM(s.card_amount), 0)::bigint AS card,
      COALESCE(SUM(s.cash_amount + s.card_amount), 0)::bigint AS revenue,
      COUNT(*)::int AS cnt
    FROM fo_sales s
    WHERE (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (s.sold_at AT TIME ZONE 'Asia/Seoul')::date >= date_trunc('month', p_to::timestamp)::date
      AND (s.sold_at AT TIME ZONE 'Asia/Seoul')::date <= p_to
  )
  SELECT jsonb_build_object(
    'cash', cash,
    'card', card,
    'revenue', revenue,
    'count', cnt
  )
  INTO v_month
  FROM month_data;

  -- 매장별 분해 (전 매장 모드일 때만)
  IF p_store_id IS NULL THEN
    WITH by_store AS (
      SELECT
        st.id,
        st.store_code,
        st.name,
        COALESCE(SUM(s.cash_amount), 0)::bigint AS cash,
        COALESCE(SUM(s.card_amount), 0)::bigint AS card,
        COALESCE(SUM(s.cash_amount + s.card_amount), 0)::bigint AS revenue,
        COUNT(s.id) FILTER (WHERE s.id IS NOT NULL)::int AS cnt
      FROM fo_stores st
      LEFT JOIN fo_sales s ON s.store_id = st.id
        AND (s.sold_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
      WHERE st.active = true
      GROUP BY st.id, st.store_code, st.name
      ORDER BY revenue DESC, st.store_code ASC
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'store_id', id,
      'store_code', store_code,
      'store_name', name,
      'cash', cash,
      'card', card,
      'revenue', revenue,
      'count', cnt
    )), '[]'::jsonb)
    INTO v_by_store
    FROM by_store;
  ELSE
    v_by_store := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'store_id', p_store_id,
    'summary', v_summary,
    'month', v_month,
    'by_store', v_by_store
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_hq_sales_stats(date, date, uuid) TO service_role, authenticated, anon;

COMMENT ON FUNCTION get_hq_sales_stats IS
  '본사 통합 통계 RPC. revenue = sum(cash + card) — 받은 돈 (할인 후).';

COMMIT;
