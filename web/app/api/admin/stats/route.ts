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

  // 환불 보정 — 기간 내 fo_returns 차감.
  const returns = await fetchReturnsTotals(db, from, to, session.store_id);
  const baseSummary = statsRes.data?.[0] as
    | {
        total_revenue?: number;
        total_cash?: number;
        total_card?: number;
        sale_count?: number;
        item_count?: number;
        month_to_date_revenue?: number;
      }
    | null
    | undefined;
  const adjustedSummary = baseSummary
    ? {
        ...baseSummary,
        total_revenue: (baseSummary.total_revenue ?? 0) - returns.amount,
        total_cash: (baseSummary.total_cash ?? 0) - returns.cashRefund,
        total_card: (baseSummary.total_card ?? 0) - returns.cardRefund,
        item_count: (baseSummary.item_count ?? 0) - returns.qty,
      }
    : null;

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
