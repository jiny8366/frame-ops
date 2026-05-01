// Frame Ops Web — /api/admin/stats
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → 기간 합계 + 월누적 + Top 상품 리스트

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const db = getDB();
  const [statsRes, topRes] = await Promise.all([
    db.rpc('get_sales_stats', { p_store_id: session.store_id, p_from: from, p_to: to }),
    db.rpc('get_top_products', {
      p_store_id: session.store_id,
      p_from: from,
      p_to: to,
      p_limit: limit,
    }),
  ]);

  if (statsRes.error) {
    return NextResponse.json({ data: null, error: statsRes.error.message }, { status: 500 });
  }
  if (topRes.error) {
    return NextResponse.json({ data: null, error: topRes.error.message }, { status: 500 });
  }

  // 환불 보정 — 기간 내 fo_returns 차감 (period_*) + 당월 환불 별도 조회로 month_* 차감.
  const periodReturns = await fetchReturnsTotals(db, from, to, session.store_id);
  // 당월 시작일 계산 (Asia/Seoul 기준)
  const seoulNow = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  );
  const monthStart = `${seoulNow.getFullYear()}-${String(seoulNow.getMonth() + 1).padStart(2, '0')}-01`;
  const monthReturns = await fetchReturnsTotals(db, monthStart, to, session.store_id);

  const baseSummary = statsRes.data?.[0] as
    | {
        period_cash?: number;
        period_card?: number;
        period_revenue?: number;
        period_count?: number;
        month_cash?: number;
        month_card?: number;
        month_revenue?: number;
      }
    | null
    | undefined;
  const adjustedSummary = baseSummary
    ? {
        ...baseSummary,
        period_revenue: (baseSummary.period_revenue ?? 0) - periodReturns.amount,
        period_cash: (baseSummary.period_cash ?? 0) - periodReturns.cashRefund,
        period_card: (baseSummary.period_card ?? 0) - periodReturns.cardRefund,
        month_revenue: (baseSummary.month_revenue ?? 0) - monthReturns.amount,
        month_cash: (baseSummary.month_cash ?? 0) - monthReturns.cashRefund,
        month_card: (baseSummary.month_card ?? 0) - monthReturns.cardRefund,
      }
    : null;
  const returns = periodReturns;

  return NextResponse.json({
    data: {
      period: { from, to },
      summary: adjustedSummary,
      top_products: topRes.data ?? [],
      returns_summary: {
        count: returns.count,
        items: returns.itemsCount,
        qty: returns.qty,
        amount: returns.amount,
        cash_refund: returns.cashRefund,
        card_refund: returns.cardRefund,
      },
    },
    error: null,
  });
}
