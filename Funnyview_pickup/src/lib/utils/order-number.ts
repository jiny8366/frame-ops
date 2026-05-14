/**
 * 사용자 친화 주문번호 생성.
 * 형식: FV{YYYYMMDD}-{6자리시퀀스}  → FV20260514-000123
 *
 * 충돌 방지를 위해 DB 측 시퀀스(daily_order_sequence) 사용 권장.
 * 본 헬퍼는 형식 포맷만 담당.
 */
export function formatOrderNumber(
  date: Date,
  sequence: number,
  prefix = 'FV',
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(6, '0');
  return `${prefix}${yyyy}${mm}${dd}-${seq}`;
}

/**
 * KST(Asia/Seoul) 기준 오늘 날짜를 반환.
 */
export function todayKst(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}
