-- ============================================================
-- 매출 / 영업이익 / 안전재고 / 픽업가맹점 정산용 SQL 뷰
-- 본 파일은 drizzle-kit generate 가 만들지 않으므로 수동 작성/적용.
-- ============================================================

-- 일별 · 가맹점별 매출 (완료 주문 기준)
CREATE OR REPLACE VIEW v_sales_daily AS
SELECT
  (o.completed_at AT TIME ZONE 'Asia/Seoul')::date           AS sale_date,
  o.pickup_store_id,
  s.name                                                     AS store_name,
  COUNT(DISTINCT o.id)                                       AS order_count,
  SUM(oi.quantity)                                           AS box_count,
  SUM(oi.line_total)                                         AS gross_revenue,
  SUM(o.discount)                                            AS discount_total,
  SUM(oi.line_total) - SUM(o.discount)                       AS net_revenue,
  SUM(oi.quantity * COALESCE(oi.unit_cost, 0))               AS cogs,
  SUM(oi.line_total) - SUM(o.discount)
    - SUM(oi.quantity * COALESCE(oi.unit_cost, 0))           AS gross_profit
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN stores s ON s.id = o.pickup_store_id
WHERE o.status = 'completed'
  AND o.completed_at IS NOT NULL
GROUP BY 1, 2, 3;

-- 월별 · 가맹점별 매출
CREATE OR REPLACE VIEW v_sales_monthly AS
SELECT
  to_char((o.completed_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM') AS sale_month,
  o.pickup_store_id,
  s.name                                                     AS store_name,
  COUNT(DISTINCT o.id)                                       AS order_count,
  SUM(oi.quantity)                                           AS box_count,
  SUM(oi.line_total)                                         AS gross_revenue,
  SUM(o.discount)                                            AS discount_total,
  SUM(oi.line_total) - SUM(o.discount)                       AS net_revenue,
  SUM(oi.quantity * COALESCE(oi.unit_cost, 0))               AS cogs,
  SUM(oi.line_total) - SUM(o.discount)
    - SUM(oi.quantity * COALESCE(oi.unit_cost, 0))           AS gross_profit
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN stores s ON s.id = o.pickup_store_id
WHERE o.status = 'completed'
  AND o.completed_at IS NOT NULL
GROUP BY 1, 2, 3;

-- 픽업가맹점 정산 (commission_rate 적용)
CREATE OR REPLACE VIEW v_store_settlement AS
SELECT
  to_char((o.completed_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM') AS settle_month,
  o.pickup_store_id,
  s.name                                                     AS store_name,
  s.commission_rate,
  SUM(oi.line_total) - SUM(o.discount)                       AS net_revenue,
  ROUND(
    (SUM(oi.line_total) - SUM(o.discount)) * s.commission_rate / 100
  )                                                          AS commission_payable
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN stores s ON s.id = o.pickup_store_id
WHERE o.status = 'completed'
  AND o.completed_at IS NOT NULL
GROUP BY 1, 2, 3, s.commission_rate;

-- 안전재고 부족 SKU 목록
CREATE OR REPLACE VIEW v_low_stock_alerts AS
SELECT
  inv.id                                                     AS inventory_id,
  lv.id                                                      AS variant_id,
  lv.sku,
  l.brand,
  l.name                                                     AS lens_name,
  lv.sphere,
  lv.cylinder,
  lv.axis,
  lv.add_power,
  inv.quantity_on_hand,
  inv.quantity_reserved,
  inv.quantity_on_hand - inv.quantity_reserved               AS available,
  inv.safety_stock,
  inv.reorder_point,
  CASE
    WHEN inv.quantity_on_hand - inv.quantity_reserved <= 0 THEN 'out_of_stock'
    WHEN inv.quantity_on_hand - inv.quantity_reserved < inv.safety_stock THEN 'below_safety'
    WHEN inv.quantity_on_hand - inv.quantity_reserved < inv.reorder_point THEN 'below_reorder'
    ELSE 'ok'
  END                                                        AS alert_level
FROM inventory inv
JOIN lens_variants lv ON lv.id = inv.variant_id
JOIN lenses l ON l.id = lv.lens_id
WHERE l.is_active = true
  AND lv.is_active = true
  AND (inv.quantity_on_hand - inv.quantity_reserved) < GREATEST(inv.safety_stock, inv.reorder_point);

-- 픽리스트(가맹점별 출고 대기) 조회 보조 인덱스
-- (orders_status_idx, orders_store_idx 이미 존재 — 별도 인덱스 불필요)
