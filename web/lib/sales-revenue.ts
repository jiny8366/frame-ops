// Frame Ops Web — 매출(revenue) 정의 단일 source of truth.
//
// 정의: revenue = cash + card (받은 돈, 할인 후).
//
// 이유:
//   fo_sales.cash_amount + card_amount 는 이미 "할인이 적용된 후 고객이 실제로 지불한 금액".
//   따라서 discount_total 을 다시 빼면 할인을 두 번 차감하는 결과가 됨 (이중 차감 금지).
//
// 사용처:
//   - /api/admin/stats   (판매통계)
//   - /api/hq/stats      (본사 통계)
//   - /api/hq/dashboard  (대시보드)
//   - 그 외 매출을 계산/노출하는 모든 곳
//
// 검증:
//   API 응답을 생성하기 전에 enforceRevenue(...) 를 호출하여
//   RPC 가 반환한 revenue 와 cash + card 가 어긋나면 console.warn 으로 알리고
//   cash + card 값으로 강제 보정. RPC drift 를 빠르게 감지하기 위한 방어선.

/** revenue 계산 — 모든 곳에서 이 함수만 사용. */
export function computeRevenue(cash: number | null | undefined, card: number | null | undefined): number {
  return (cash ?? 0) + (card ?? 0);
}

/**
 * revenue 일관성 강제 + drift 검출.
 * 입력 객체에 cash, card 가 있으면 revenue 를 cash + card 로 강제 (이미 같으면 그대로).
 * RPC 가 어긋난 revenue 를 반환하면 console.warn 으로 누적 알림.
 *
 * @returns 항상 같은 객체(in-place 수정). 호출자는 반환값을 그대로 응답에 사용 가능.
 */
export function enforceRevenue<T extends { cash?: number | null; card?: number | null; revenue?: number | null }>(
  obj: T,
  label = 'revenue'
): T {
  if (!obj) return obj;
  const cash = Number(obj.cash ?? 0);
  const card = Number(obj.card ?? 0);
  const expected = cash + card;
  const reported = Number(obj.revenue ?? 0);
  if (reported !== expected) {
    // RPC drift / 환불 보정 불일치 — 운영자 가시화
    console.warn(
      `[sales-revenue] ${label}: revenue(${reported}) ≠ cash+card(${expected}). 차이 ${reported - expected}. cash+card 로 강제 보정.`
    );
  }
  (obj as { revenue?: number }).revenue = expected;
  return obj;
}

/**
 * period_revenue / period_cash / period_card 같은 prefix 형식 (admin/stats) 용 보정.
 * period_revenue 와 month_revenue 양쪽 모두 일관성 강제.
 */
export function enforcePeriodRevenue<T extends Record<string, unknown>>(
  summary: T,
  label = 'stats'
): T {
  if (!summary) return summary;
  const s = summary as Record<string, number | null | undefined>;
  const pCash = Number(s.period_cash ?? 0);
  const pCard = Number(s.period_card ?? 0);
  const pExpected = pCash + pCard;
  if (Number(s.period_revenue ?? 0) !== pExpected) {
    console.warn(
      `[sales-revenue] ${label}.period: revenue(${s.period_revenue}) ≠ cash+card(${pExpected}). 강제 보정.`
    );
    s.period_revenue = pExpected;
  }
  const mCash = Number(s.month_cash ?? 0);
  const mCard = Number(s.month_card ?? 0);
  const mExpected = mCash + mCard;
  if (Number(s.month_revenue ?? 0) !== mExpected) {
    console.warn(
      `[sales-revenue] ${label}.month: revenue(${s.month_revenue}) ≠ cash+card(${mExpected}). 강제 보정.`
    );
    s.month_revenue = mExpected;
  }
  return summary;
}
