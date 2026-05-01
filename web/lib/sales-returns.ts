// Frame Ops Web — 환불(fo_returns) 집계 헬퍼
// fo_sales 기반 RPC 결과에 환불을 차감 반영하기 위한 공용 함수.
// 정산/통계/대시보드 RPC 가 fo_returns 를 미반영하므로 클라이언트(API) 측에서 보정.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export interface ReturnsTotals {
  count: number;          // 환불 건수 (fo_returns 행 개수)
  itemsCount: number;     // 환불된 라인 수
  qty: number;            // 환불 수량 합 (양수)
  amount: number;         // 환불 총액 (양수, 환불액)
  cashRefund: number;     // 현금 환불액 합 (note JSON 파싱)
  cardRefund: number;     // 카드 환불액 합
}

interface ReturnNoteMeta {
  cash_amount?: number;
  card_amount?: number;
  seller_label?: string | null;
}

function parseReturnNoteJson(note: string | null | undefined): ReturnNoteMeta {
  if (!note) return {};
  const m = note.match(/\{[^{}]*\}\s*$/);
  if (!m) return {};
  try {
    return JSON.parse(m[0]) as ReturnNoteMeta;
  } catch {
    return {};
  }
}

/**
 * 기간/매장 조건의 환불 합계를 산출. RPC 결과에서 차감하여 sale 합계를 정확히 보정.
 * - period: ISO date or datetime range (YYYY-MM-DD 권장)
 * - storeId: null/undefined 면 전 매장 (HQ 용)
 */
export async function fetchReturnsTotals(
  db: SupabaseClient<Database>,
  fromDate: string,
  toDate: string,
  storeId: string | null
): Promise<ReturnsTotals> {
  let q = db
    .from('fo_returns')
    .select('id, note, store_id')
    .gte('returned_at', fromDate)
    .lte('returned_at', `${toDate}T23:59:59.999`);
  if (storeId) q = q.eq('store_id', storeId);

  const { data: returns } = await q;
  const returnList = returns ?? [];
  const result: ReturnsTotals = {
    count: returnList.length,
    itemsCount: 0,
    qty: 0,
    amount: 0,
    cashRefund: 0,
    cardRefund: 0,
  };
  if (returnList.length === 0) return result;

  // 라인 합계
  const { data: lines } = await db
    .from('fo_return_lines')
    .select('quantity, unit_price, return_id')
    .in('return_id', returnList.map((r) => r.id));
  for (const l of lines ?? []) {
    result.itemsCount += 1;
    result.qty += l.quantity;
    result.amount += l.quantity * l.unit_price;
  }
  // 결제수단별 환불액 (note JSON 파싱)
  for (const r of returnList) {
    const meta = parseReturnNoteJson(r.note);
    result.cashRefund += Number(meta.cash_amount ?? 0);
    result.cardRefund += Number(meta.card_amount ?? 0);
  }
  return result;
}
