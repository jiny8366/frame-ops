-- Frame Ops — apply_stock_audit RPC 의 ambiguous 컬럼 참조 수정
--
-- 사용자 보고:
--   재고조사 페이지 '✓ 적용' 클릭 시 에러:
--   "column reference \"audit_id\" is ambiguous"
--
-- 근본 원인:
--   apply_stock_audit RETURNS TABLE 의 OUT 파라미터 이름이 `audit_id` 인데
--   함수 본문의 미매칭 라인 카운트 쿼리에서 컬럼명 audit_id 를 별칭 없이 참조:
--     SELECT COUNT(*) INTO v_skipped
--     FROM fo_stock_audit_lines
--     WHERE audit_id = p_audit_id ...    ← OUT 파라미터? 컬럼? PostgreSQL 모호 판정
--
-- 수정:
--   해당 쿼리에서 fo_stock_audit_lines.audit_id 로 fully-qualify.
--   동시에 두 번째 UPDATE 도 명시화하여 동일 위험 사전 차단.
--   반환 타입은 그대로 유지 (호환).

BEGIN;

DROP FUNCTION IF EXISTS apply_stock_audit(uuid);

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
    WHERE sal.audit_id = p_audit_id        -- sal. 별칭으로 명시
      AND sal.match_status = 'matched'
      AND sal.product_id IS NOT NULL
  LOOP
    DECLARE
      v_baseline    INT := rec.current_stock - rec.delta_after_audit;
      v_audit_delta INT := rec.counted_quantity - v_baseline;
      v_final       INT := rec.counted_quantity + rec.delta_after_audit;
    BEGIN
      INSERT INTO fo_stock(store_id, product_id, quantity, updated_at)
      VALUES (v_audit.store_id, rec.product_id, v_final, NOW())
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

      UPDATE fo_products SET stock_quantity = v_final WHERE id = rec.product_id;

      UPDATE fo_stock_audit_lines AS sal
      SET baseline_at_audit = v_baseline,
          audit_delta       = v_audit_delta,
          delta_after_audit = rec.delta_after_audit,
          applied_quantity  = v_final
      WHERE sal.id = rec.line_id;

      v_applied   := v_applied + 1;
      v_total_qty := v_total_qty + v_final;
    END;
  END LOOP;

  -- ★ FIX: 컬럼 audit_id 를 fo_stock_audit_lines.audit_id 로 fully-qualify
  --        (이전엔 OUT 파라미터 audit_id 와 모호하여 'is ambiguous' 에러 발생)
  SELECT COUNT(*)::INT INTO v_skipped
  FROM fo_stock_audit_lines sal
  WHERE sal.audit_id = p_audit_id
    AND sal.match_status <> 'matched';

  UPDATE fo_stock_audits AS sa
  SET status = 'applied', applied_at = NOW(), matched_lines = v_applied
  WHERE sa.id = p_audit_id;

  RETURN QUERY SELECT p_audit_id, v_applied, v_skipped, v_total_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_stock_audit(uuid) TO service_role, authenticated, anon;

COMMENT ON FUNCTION apply_stock_audit IS
  '재고조사 적용. baseline_at_audit / audit_delta 기록 후 fo_stock 갱신. 모든 컬럼 참조 별칭 명시.';

COMMIT;
