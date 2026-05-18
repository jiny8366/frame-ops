-- Frame Ops — 주문리스트 매입처 결정 로직 수정
-- 매입처-브랜드 매핑(fo_supplier_brands) 이 의도대로 작동하도록 RPC fallback 추가.
--
-- 배경:
--   사용자 제보 — 매입처 등록 시 브랜드 묶기가 가능한 UI 가 있는데
--   주문리스트에서는 그 매핑이 반영되지 않고 '매입처 미지정' 으로 나옴.
--
-- 근본 원인:
--   2026-05-01 마이그레이션에서 get_pending_orders / mark_orders_placed 가
--   fo_products.supplier_id 만 직접 참조하도록 변경되었음.
--   fo_supplier_brands 매핑은 UI 에 그대로 살아있지만 실제 주문 분류엔 무시됨.
--
-- 해결 (사용자 결정):
--   1) fo_supplier_brands(brand_id) 에 UNIQUE 제약 추가 → 한 브랜드는 단일 매입처에만.
--   2) get_pending_orders 매입처 결정 우선순위:
--      a) p.supplier_id (상품에 명시적 지정)
--      b) fo_supplier_brands(p.brand_id) → supplier 매핑 (fallback)
--      c) NULL → '매입처 미지정'
--   3) mark_orders_placed 도 동일 우선순위로 발주 처리.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fo_supplier_brands(brand_id) UNIQUE 제약
--    (현재 PK 는 (supplier_id, brand_id) 인데 brand_id 단독으로도 unique 필요)
--    검증: 본 마이그레이션 적용 전 production 에서 중복 매핑 없음 확인 완료.
-- ─────────────────────────────────────────────────────────────────────────────
DO $unique$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fo_supplier_brands_brand_id_key'
  ) THEN
    ALTER TABLE fo_supplier_brands
      ADD CONSTRAINT fo_supplier_brands_brand_id_key UNIQUE (brand_id);
  END IF;
END $unique$;

COMMENT ON CONSTRAINT fo_supplier_brands_brand_id_key
  ON fo_supplier_brands IS '한 브랜드는 오직 하나의 매입처에만 매핑 (사용자 정책).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_pending_orders — supplier fallback
--    반환 컬럼 형식은 기존과 동일 (호환). supplier_source 메타만 추가.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_pending_orders(uuid, date, date);

CREATE FUNCTION get_pending_orders(
  p_store_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  supplier_code text,
  supplier_source text,   -- 'direct' | 'brand_mapping' | 'unassigned' (UI 진단용)
  product_id uuid,
  brand_id uuid,
  brand_name text,
  style_code text,
  color_code text,
  display_name text,
  total_quantity int,
  unit_price int,
  cost_price int
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      p.id AS product_id,
      p.brand_id,
      p.style_code,
      p.color_code,
      p.display_name,
      p.sale_price::int AS unit_price,
      p.cost_price::int AS cost_price,
      SUM(si.quantity)::int AS total_quantity,
      p.supplier_id AS direct_supplier_id
    FROM fo_sale_items si
    JOIN fo_sales sale ON sale.id = si.sale_id
    JOIN fo_products p ON p.id = si.product_id
    WHERE sale.store_id = p_store_id
      AND (sale.sold_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
      AND si.ordered_at IS NULL
    GROUP BY p.id, p.brand_id, p.style_code, p.color_code, p.display_name,
             p.sale_price, p.cost_price, p.supplier_id
  ),
  resolved AS (
    SELECT
      -- 1순위: 명시적 p.supplier_id
      -- 2순위: 브랜드 매핑 (fo_supplier_brands)
      COALESCE(b.direct_supplier_id, sb.supplier_id) AS supplier_id,
      CASE
        WHEN b.direct_supplier_id IS NOT NULL THEN 'direct'
        WHEN sb.supplier_id IS NOT NULL THEN 'brand_mapping'
        ELSE 'unassigned'
      END AS supplier_source,
      b.product_id, b.brand_id, b.style_code, b.color_code, b.display_name,
      b.unit_price, b.cost_price, b.total_quantity
    FROM base b
    LEFT JOIN fo_supplier_brands sb ON sb.brand_id = b.brand_id
  )
  SELECT
    r.supplier_id,
    sup.name AS supplier_name,
    sup.supplier_code,
    r.supplier_source,
    r.product_id,
    r.brand_id,
    br.name AS brand_name,
    r.style_code,
    r.color_code,
    r.display_name,
    r.total_quantity,
    r.unit_price,
    r.cost_price
  FROM resolved r
  LEFT JOIN fo_suppliers sup ON sup.id = r.supplier_id
  LEFT JOIN fo_brands br ON br.id = r.brand_id
  ORDER BY sup.name NULLS LAST, br.name, r.style_code, r.color_code;
$$;

GRANT EXECUTE ON FUNCTION get_pending_orders(uuid, date, date) TO service_role;

COMMENT ON FUNCTION get_pending_orders IS
  '주문리스트. supplier_id 결정: fo_products.supplier_id (1순위) → fo_supplier_brands 매핑 (fallback).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. mark_orders_placed — 동일 우선순위로 발주 처리
--    p_supplier_id 가 어느 매입처를 가리키든, 그 매입처에 속한 모든 미발주 라인을 처리:
--    a) 상품의 supplier_id 가 p_supplier_id 이거나
--    b) 상품의 supplier_id 가 NULL 이고 브랜드가 p_supplier_id 에 매핑된 경우
--    p_supplier_id = NULL 이면 '매입처 미지정' (direct + brand_mapping 둘 다 없는 상품) 처리.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS mark_orders_placed(uuid, uuid, date, date, uuid);

CREATE FUNCTION mark_orders_placed(
  p_store_id uuid,
  p_supplier_id uuid,
  p_from date,
  p_to date,
  p_user_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  WITH target AS (
    SELECT si.id
    FROM fo_sale_items si
    JOIN fo_sales sale ON sale.id = si.sale_id
    JOIN fo_products p ON p.id = si.product_id
    LEFT JOIN fo_supplier_brands sb ON sb.brand_id = p.brand_id
    WHERE sale.store_id = p_store_id
      AND (sale.sold_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
      AND si.ordered_at IS NULL
      AND (
        -- p_supplier_id 와 결정된 supplier_id 비교 (NULL safe)
        COALESCE(p.supplier_id, sb.supplier_id) IS NOT DISTINCT FROM p_supplier_id
      )
  )
  UPDATE fo_sale_items
  SET ordered_at = NOW(),
      ordered_by_user_id = p_user_id
  WHERE id IN (SELECT id FROM target);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_orders_placed(uuid, uuid, date, date, uuid) TO service_role;

COMMENT ON FUNCTION mark_orders_placed IS
  '발주 처리. supplier_id 결정 = COALESCE(p.supplier_id, brand mapping). get_pending_orders 와 동일 우선순위.';

COMMIT;
