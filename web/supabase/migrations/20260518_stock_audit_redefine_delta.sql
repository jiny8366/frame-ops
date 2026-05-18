-- Frame Ops — 재고조사 모델 재정립
-- (PR #128 의 stock audit RPC 를 정확한 정의로 교체)
--
-- 변경 사유:
--   기존 baseline_at_audit = "현재 시점 fo_stock 값" → audit_date 시점 추산이 아님.
--   "증감" 컬럼이 applied - current 였는데, 이는 시스템 보정량이지
--   재고조사의 본래 의미인 "실재고조사 시점 시스템 재고 vs 실물 카운팅 차이" 가 아님.
--
-- 새 모델:
--   baseline_at_audit  = current_stock − delta_after_audit    (audit_date 시점 추산 재고)
--   audit_delta        = counted_quantity − baseline_at_audit (★ 실재고조사로 발견된 진짜 증감)
--   applied_quantity   = counted + delta_after_audit          (적용 시 최종 재고)
--   delta_after_audit  = audit_date 이후 net 거래 (+매입 +환불 +이동IN −판매 −출고 −이동OUT)
--
-- 추가:
--   - audit_delta 컬럼을 fo_stock_audit_lines 에 컬럼 추가 (감사 추적)
--   - preview/apply RPC 의 반환 컬럼에 baseline_at_audit, audit_delta 명확히 노출

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 라인 테이블에 audit_delta 컬럼 (감사 추적)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fo_stock_audit_lines
  ADD COLUMN IF NOT EXISTS audit_delta INT;
COMMENT ON COLUMN fo_stock_audit_lines.audit_delta IS
  '실재고조사 증감 = counted_quantity − baseline_at_audit. 분실/오기록/도난 등으로 발견된 차이.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. preview_stock_audit — 재정의
--    반환에 baseline_at_audit, audit_delta 추가. 'delta_after_audit' 의미는 동일.
--    반환 타입이 변경되므로 DROP 후 CREATE.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS preview_stock_audit(UUID);
CREATE FUNCTION preview_stock_audit(p_audit_id UUID)
RETURNS TABLE (
  line_id            UUID,
  product_id         UUID,
  brand_name         TEXT,
  style_code         TEXT,
  color_code         TEXT,
  current_stock      INT,
  baseline_at_audit  INT,       -- audit_date 시점 추산 = current_stock - delta_after_audit
  counted_quantity   INT,
  audit_delta        INT,       -- ★ 실재고조사 증감 = counted - baseline_at_audit
  delta_after_audit  INT,       -- audit_date 이후 거래 net
  applied_quantity   INT,       -- 적용 후 최종 = counted + delta_after_audit
  match_status       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_date DATE;
  v_store_id   UUID;
  v_audit_ts   TIMESTAMPTZ;
BEGIN
  SELECT audit_date, store_id INTO v_audit_date, v_store_id
  FROM fo_stock_audits WHERE id = p_audit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '재고조사를 찾을 수 없습니다: %', p_audit_id;
  END IF;

  -- audit_date 영업종료 = audit_date + 1 의 KST 00:00 (= UTC 전날 15:00)
  v_audit_ts := ((v_audit_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul');

  RETURN QUERY
  WITH per_line AS (
    SELECT
      sal.id                                                  AS line_id_,
      sal.product_id                                          AS product_id_,
      br.name                                                 AS brand_name_,
      p.style_code                                            AS style_code_,
      p.color_code                                            AS color_code_,
      COALESCE(s.quantity, p.stock_quantity, 0)::INT          AS current_stock_,
      sal.counted_quantity                                    AS counted_,
      -- audit_date 이후 net 거래량
      (
        COALESCE((SELECT SUM(il.quantity)::INT
          FROM fo_inbound_lines il
          JOIN fo_inbound_receipts ir ON ir.id = il.inbound_receipt_id
          WHERE il.product_id = sal.product_id
            AND ir.store_id = v_store_id
            AND ir.document_at >= v_audit_ts), 0)
        + COALESCE((SELECT SUM(rl.quantity)::INT
          FROM fo_return_lines rl
          JOIN fo_returns r ON r.id = rl.return_id
          WHERE rl.product_id = sal.product_id
            AND r.store_id = v_store_id
            AND r.returned_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(si.quantity)::INT
          FROM fo_sale_items si
          JOIN fo_sales sa ON sa.id = si.sale_id
          WHERE si.product_id = sal.product_id
            AND sa.store_id = v_store_id
            AND sa.sold_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(ol.quantity)::INT
          FROM fo_outbound_lines ol
          JOIN fo_outbound_shipments os ON os.id = ol.outbound_shipment_id
          WHERE ol.product_id = sal.product_id
            AND os.store_id = v_store_id
            AND os.document_at >= v_audit_ts), 0)
        + COALESCE((SELECT SUM(tl.quantity)::INT
          FROM fo_interstore_transfer_lines tl
          JOIN fo_interstore_transfers t ON t.id = tl.transfer_id
          WHERE tl.product_id = sal.product_id
            AND t.to_store_id = v_store_id
            AND t.status = 'accepted'
            AND t.decided_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(tl.quantity)::INT
          FROM fo_interstore_transfer_lines tl
          JOIN fo_interstore_transfers t ON t.id = tl.transfer_id
          WHERE tl.product_id = sal.product_id
            AND t.from_store_id = v_store_id
            AND t.status IN ('accepted','pending')
            AND t.document_at >= v_audit_ts), 0)
      )::INT                                                 AS delta_,
      sal.match_status                                       AS match_status_
    FROM fo_stock_audit_lines sal
    LEFT JOIN fo_products p  ON p.id = sal.product_id
    LEFT JOIN fo_brands   br ON br.id = p.brand_id
    LEFT JOIN fo_stock    s  ON s.product_id = sal.product_id AND s.store_id = v_store_id
    WHERE sal.audit_id = p_audit_id
  )
  SELECT
    line_id_                                              AS line_id,
    product_id_                                           AS product_id,
    brand_name_                                           AS brand_name,
    style_code_                                           AS style_code,
    color_code_                                           AS color_code,
    current_stock_                                        AS current_stock,
    (current_stock_ - delta_)::INT                        AS baseline_at_audit,
    counted_                                              AS counted_quantity,
    (counted_ - (current_stock_ - delta_))::INT           AS audit_delta,
    delta_                                                AS delta_after_audit,
    (counted_ + delta_)::INT                              AS applied_quantity,
    match_status_                                         AS match_status
  FROM per_line
  ORDER BY brand_name_ NULLS LAST, style_code_ NULLS LAST, color_code_ NULLS LAST;
END;
$$;

COMMENT ON FUNCTION preview_stock_audit IS
  '재고조사 적용 전 시뮬레이션. baseline_at_audit 은 audit_date 시점 추산, audit_delta 는 실재고조사로 발견된 증감.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. apply_stock_audit — 재정의 (반환 타입 동일이라 CREATE OR REPLACE 가능하지만
--    일관성을 위해 DROP 후 CREATE).
--    fo_stock_audit_lines 에 baseline_at_audit / audit_delta / delta_after_audit / applied_quantity
--    모두 기록 (감사 추적). fo_stock 갱신은 동일.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS apply_stock_audit(UUID);
CREATE FUNCTION apply_stock_audit(p_audit_id UUID)
RETURNS TABLE (
  audit_id        UUID,
  applied_lines   INT,
  skipped_lines   INT,
  total_quantity  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit       RECORD;
  v_audit_ts    TIMESTAMPTZ;
  v_applied     INT := 0;
  v_skipped     INT := 0;
  v_total_qty   INT := 0;
  rec           RECORD;
BEGIN
  SELECT * INTO v_audit FROM fo_stock_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '재고조사를 찾을 수 없습니다: %', p_audit_id;
  END IF;
  IF v_audit.status = 'applied' THEN
    RAISE EXCEPTION '이미 적용된 재고조사입니다 (applied_at=%)', v_audit.applied_at;
  END IF;
  IF v_audit.status = 'cancelled' THEN
    RAISE EXCEPTION '취소된 재고조사는 적용할 수 없습니다';
  END IF;

  v_audit_ts := ((v_audit.audit_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul');

  FOR rec IN
    SELECT
      sal.id              AS line_id,
      sal.product_id      AS product_id,
      sal.counted_quantity,
      COALESCE(s.quantity, p.stock_quantity, 0)::INT AS current_stock,
      (
        COALESCE((SELECT SUM(il.quantity)::INT
          FROM fo_inbound_lines il
          JOIN fo_inbound_receipts ir ON ir.id = il.inbound_receipt_id
          WHERE il.product_id = sal.product_id
            AND ir.store_id = v_audit.store_id
            AND ir.document_at >= v_audit_ts), 0)
        + COALESCE((SELECT SUM(rl.quantity)::INT
          FROM fo_return_lines rl
          JOIN fo_returns r ON r.id = rl.return_id
          WHERE rl.product_id = sal.product_id
            AND r.store_id = v_audit.store_id
            AND r.returned_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(si.quantity)::INT
          FROM fo_sale_items si
          JOIN fo_sales sa ON sa.id = si.sale_id
          WHERE si.product_id = sal.product_id
            AND sa.store_id = v_audit.store_id
            AND sa.sold_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(ol.quantity)::INT
          FROM fo_outbound_lines ol
          JOIN fo_outbound_shipments os ON os.id = ol.outbound_shipment_id
          WHERE ol.product_id = sal.product_id
            AND os.store_id = v_audit.store_id
            AND os.document_at >= v_audit_ts), 0)
        + COALESCE((SELECT SUM(tl.quantity)::INT
          FROM fo_interstore_transfer_lines tl
          JOIN fo_interstore_transfers t ON t.id = tl.transfer_id
          WHERE tl.product_id = sal.product_id
            AND t.to_store_id = v_audit.store_id
            AND t.status = 'accepted'
            AND t.decided_at >= v_audit_ts), 0)
        - COALESCE((SELECT SUM(tl.quantity)::INT
          FROM fo_interstore_transfer_lines tl
          JOIN fo_interstore_transfers t ON t.id = tl.transfer_id
          WHERE tl.product_id = sal.product_id
            AND t.from_store_id = v_audit.store_id
            AND t.status IN ('accepted','pending')
            AND t.document_at >= v_audit_ts), 0)
      )::INT AS delta_after_audit
    FROM fo_stock_audit_lines sal
    LEFT JOIN fo_products p ON p.id = sal.product_id
    LEFT JOIN fo_stock    s ON s.product_id = sal.product_id AND s.store_id = v_audit.store_id
    WHERE sal.audit_id = p_audit_id
      AND sal.match_status = 'matched'
      AND sal.product_id IS NOT NULL
  LOOP
    DECLARE
      v_baseline INT := rec.current_stock - rec.delta_after_audit;
      v_audit_delta INT := rec.counted_quantity - v_baseline;
      v_final INT := rec.counted_quantity + rec.delta_after_audit;
    BEGIN
      INSERT INTO fo_stock(store_id, product_id, quantity, updated_at)
      VALUES (v_audit.store_id, rec.product_id, v_final, NOW())
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

      UPDATE fo_products SET stock_quantity = v_final WHERE id = rec.product_id;

      UPDATE fo_stock_audit_lines
      SET baseline_at_audit = v_baseline,
          audit_delta       = v_audit_delta,
          delta_after_audit = rec.delta_after_audit,
          applied_quantity  = v_final
      WHERE id = rec.line_id;

      v_applied   := v_applied + 1;
      v_total_qty := v_total_qty + v_final;
    END;
  END LOOP;

  SELECT COUNT(*)::INT INTO v_skipped
  FROM fo_stock_audit_lines
  WHERE audit_id = p_audit_id AND match_status <> 'matched';

  UPDATE fo_stock_audits
  SET status = 'applied', applied_at = NOW(), matched_lines = v_applied
  WHERE id = p_audit_id;

  RETURN QUERY SELECT p_audit_id, v_applied, v_skipped, v_total_qty;
END;
$$;

COMMENT ON FUNCTION apply_stock_audit IS
  '재고조사 적용. baseline_at_audit (audit_date 시점 추산), audit_delta (실재고조사 증감) 기록 후 fo_stock 갱신.';

COMMIT;
