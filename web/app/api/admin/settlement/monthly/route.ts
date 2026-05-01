// Frame Ops Web — /api/admin/settlement/monthly?ym=YYYY-MM
// 정산 페이지 우측 리스트용 — 당월 일자별 매출/현금/카드/건수/지출.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface DayRow {
  business_date: string;
  sales_amount: number;
  cash_amount: number;
  card_amount: number;
  sales_count: number;
  expense: number;
  // 클라이언트 측 분리 — fo_settlement_expenses.memo 의 [CARD] 접두로 구분
  cash_expense?: number;
  card_expense?: number;
}

const CARD_EXPENSE_PREFIX = '[CARD] ';

function thisYearMonth(): string {
  // KST 기준 영업월 (RPC 가 Asia/Seoul 일자로 버킷팅하므로 일관 유지)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return ymd.slice(0, 7);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const ym = url.searchParams.get('ym') || thisYearMonth();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    return NextResponse.json(
      { data: null, error: 'ym 형식은 YYYY-MM 이어야 합니다.' },
      { status: 400 }
    );
  }

  const db = getDB();
  // RPC 타입 자동 생성 전 — typed-rpc 우회
  const { data, error } = await (db.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: DayRow[] | null; error: { message: string } | null }>)(
    'get_monthly_settlement_list',
    { p_store_id: session.store_id, p_year_month: ym }
  );

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 일자별 카드/현금 지출 분리 — fo_settlements + fo_settlement_expenses 직접 조회 후 매장 일자별 집계.
  // 매장별 정산 행을 가져와 settlement_id 와 business_date 매핑 후, 지출 라인을 [CARD] 접두로 분리.
  const days = data ?? [];
  if (days.length > 0) {
    const ymStart = `${ym}-01`;
    const nextYm = ((): string => {
      const [y, m] = ym.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      return `${next}-01`;
    })();
    const { data: settlements } = await db
      .from('fo_settlements')
      .select('id, business_date')
      .eq('store_id', session.store_id)
      .gte('business_date', ymStart)
      .lt('business_date', nextYm);
    const sList = settlements ?? [];
    const byDate = new Map<string, { id: string; cash: number; card: number }>();
    if (sList.length > 0) {
      const { data: expRows } = await db
        .from('fo_settlement_expenses')
        .select('settlement_id, amount, memo')
        .in('settlement_id', sList.map((s) => s.id));
      const expBySettlement = new Map<string, { cash: number; card: number }>();
      for (const e of expRows ?? []) {
        const isCard = typeof e.memo === 'string' && e.memo.startsWith(CARD_EXPENSE_PREFIX);
        const cur = expBySettlement.get(e.settlement_id) ?? { cash: 0, card: 0 };
        if (isCard) cur.card += e.amount;
        else cur.cash += e.amount;
        expBySettlement.set(e.settlement_id, cur);
      }
      for (const s of sList) {
        const sums = expBySettlement.get(s.id) ?? { cash: 0, card: 0 };
        byDate.set(s.business_date, { id: s.id, ...sums });
      }
    }
    for (const d of days) {
      const e = byDate.get(d.business_date);
      d.cash_expense = e?.cash ?? d.expense ?? 0;
      d.card_expense = e?.card ?? 0;
    }
  }

  return NextResponse.json({
    data: { year_month: ym, days },
    error: null,
  });
}
