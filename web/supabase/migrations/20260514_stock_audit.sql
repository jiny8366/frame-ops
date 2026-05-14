-- Frame Ops — 재고조사 (Stock Audit) 기능
-- 실재고조사 후 1-3일 시차가 있어도 그 사이의 POS 거래(판매/환불/매입/출고/이동) 를
-- 자동 보정하여 현재고를 정확히 산출.
--
-- 흐름:
--   1) 사용자가 inventory 페이지에서 현재고 엑셀 다운로드 (T0).
--   2) 매장에서 실물 카운팅 진행 (T0 ~ T1, 1-3일).
--   3) 변경된 수량을 엑셀에 적고 audit_date=T0 으로 업로드 (T1).
--   4) 서버가 T0 이후 거래량을 product 별로 집계 →
--      final_stock = counted_quantity
--                   + (T0 이후 매입 + 환불 입고 + 점간이동 IN)
--                   - (T0 이후 판매 + 출고 + 점간이동 OUT)
--      fo_stock.quantity = final_stock 으로 갱신.
--
-- 멱등성: status='draft' → 사용자가 미리보기 → 'apply' 시 status='applied' 로 전환.
-- 'applied' 인 audit 은 재적용 불가 (중복 방지).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fo_stock_audits — 재고조사 헤더
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fo_stock_audits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES fo_stores(id) ON DELETE CASCADE,
  audit_date    DATE NOT NULL,                   -- 실재고조사 시점(영업 종료 기준 KST)
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by   UUID REFERENCES fo_staff_profiles(user_id),  -- 작성자 (fo_staff_profiles.user_id)
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'    -- 'draft' | 'applied' | 'cancelled'
                  CHECK (status IN ('draft', 'applied', 'cancelled')),
  applied_at    TIMESTAMPTZ,
  total_lines   INT NOT NULL DEFAULT 0,
  matched_lines INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fo_stock_audits_store_date
  ON fo_stock_audits (store_id, audit_date DESC);

COMMENT ON TABLE fo_stock_audits IS '실재고조사 헤더. audit_date 기준으로 POS 거래 시차를 자동 보정.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fo_stock_audit_lines — 재고조사 라인
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fo_stock_audit_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id            UUID NOT NULL REFERENCES fo_stock_audits(id) ON DELETE CASCADE,
  product_id          UUID REFERENCES fo_products(id),   -- 매칭 실패 시 NULL
  raw_brand           TEXT,                              -- 엑셀 원본 (디버깅/감사용)
  raw_style_code      TEXT,
  raw_color_code      TEXT,
  counted_quantity    INT NOT NULL,                      -- 실재고 카운트 수량
  -- 적용 시점에 계산되어 기록되는 값들 (재적용 방지·감사 추적)
  baseline_at_audit   INT,                               -- audit_date 시점의 시스템 재고 (기록용)
  delta_after_audit   INT,                               -- audit_date 이후 net 거래량 (+매입+환불-판매-출고±이동)
  applied_quantity    INT,                               -- 최종 적용 수량 = counted + delta
  match_status        TEXT NOT NULL DEFAULT 'matched'    -- 'matched' | 'unmatched' | 'skipped'
                        CHECK (match_status IN ('matched','unmatched','skipped'))
);

CREATE INDEX IF NOT EXISTS idx_fo_stock_audit_lines_audit
  ON fo_stock_audit_lines (audit_id);
CREATE INDEX IF NOT EXISTS idx_fo_stock_audit_lines_product
  ON fo_stock_audit_lines (product_id) WHERE product_id IS NOT NULL;

COMMENT ON TABLE fo_stock_audit_lines IS '재고조사 라인. counted_quantity 는 사용자 입력, applied_quantity 는 보정 후 최종 적용 수량.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: preview_stock_audit — 적용 전 시뮬레이션
--    각 라인의 baseline / delta / applied 를 계산하여 반환 (DB 변경 없음).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION preview_stock_audit(p_audit_id UUID)
RETURNS TABLE (
  line_id           UUID,
  product_id        UUID,
  brand_name        TEXT,
  style_code        TEXT,
  color_code        TEXT,
  current_stock     INT,
  counted_quantity  INT,
  delta_after_audit INT,
  applied_quantity  INT,
  match_status      TEXT
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

  -- audit_date 의 23:59:59 KST = audit_date 다음날 00:00 UTC 보다 약 9시간 전.
  -- 보수적으로 audit_date 끝 = audit_date+1 의 00:00 KST = (audit_date+1) - 9h UTC.
  -- 즉 audit_date+1 의 KST 자정 직전까지 영업 시간 내 거래는 audit 기준에 포함되지 않음.
  v_audit_ts := ((v_audit_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul');

  RETURN QUERY
  SELECT
    sal.id                                                 AS line_id,
    sal.product_id                                         AS product_id,
    br.name                                                AS brand_name,
    p.style_code                                           AS style_code,
    p.color_code                                           AS color_code,
    COALESCE(s.quantity, p.stock_quantity, 0)::INT         AS current_stock,
    sal.counted_quantity                                   AS counted_quantity,
    -- audit_date 이후 net 거래량 (해당 store + product 한정)
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
    )::INT                                                 AS delta_after_audit,
    (sal.counted_quantity +
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
    )::INT                                                 AS applied_quantity,
    sal.match_status                                       AS match_status
  FROM fo_stock_audit_lines sal
  LEFT JOIN fo_products p  ON p.id = sal.product_id
  LEFT JOIN fo_brands   br ON br.id = p.brand_id
  LEFT JOIN fo_stock    s  ON s.product_id = sal.product_id AND s.store_id = v_store_id
  WHERE sal.audit_id = p_audit_id
  ORDER BY br.name NULLS LAST, p.style_code NULLS LAST, p.color_code NULLS LAST;
END;
$$;

COMMENT ON FUNCTION preview_stock_audit IS '재고조사 적용 전 시뮬레이션. DB 변경 없음.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: apply_stock_audit — 적용 확정
--    preview 와 동일 계산식으로 final_stock 산출 → fo_stock 갱신.
--    fo_stock_audit_lines.baseline_at_audit / delta_after_audit / applied_quantity 도 기록.
--    fo_stock_audits.status='applied', applied_at=NOW().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_stock_audit(p_audit_id UUID)
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

  -- 매칭된 라인에 대해 보정 계산 + fo_stock upsert
  FOR rec IN
    SELECT
      sal.id              AS line_id,
      sal.product_id      AS product_id,
      sal.counted_quantity,
      COALESCE(s.quantity, p.stock_quantity, 0)::INT AS baseline_at_audit,
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
      v_final INT := rec.counted_quantity + rec.delta_after_audit;
    BEGIN
      -- fo_stock upsert (매장별 재고 원장)
      INSERT INTO fo_stock(store_id, product_id, quantity, updated_at)
      VALUES (v_audit.store_id, rec.product_id, v_final, NOW())
      ON CONFLICT (store_id, product_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

      -- fo_products.stock_quantity 도 함께 (single-store 호환). 동기 보장.
      UPDATE fo_products SET stock_quantity = v_final WHERE id = rec.product_id;

      -- 라인에 기록 (감사 추적)
      UPDATE fo_stock_audit_lines
      SET baseline_at_audit = rec.baseline_at_audit,
          delta_after_audit = rec.delta_after_audit,
          applied_quantity  = v_final
      WHERE id = rec.line_id;

      v_applied   := v_applied + 1;
      v_total_qty := v_total_qty + v_final;
    END;
  END LOOP;

  -- 미매칭/skipped 카운트
  SELECT COUNT(*)::INT INTO v_skipped
  FROM fo_stock_audit_lines
  WHERE audit_id = p_audit_id AND match_status <> 'matched';

  UPDATE fo_stock_audits
  SET status = 'applied', applied_at = NOW(), matched_lines = v_applied
  WHERE id = p_audit_id;

  RETURN QUERY SELECT p_audit_id, v_applied, v_skipped, v_total_qty;
END;
$$;

COMMENT ON FUNCTION apply_stock_audit IS '재고조사 적용. audit_date 이후 거래량을 보정하여 fo_stock 갱신.';

COMMIT;
