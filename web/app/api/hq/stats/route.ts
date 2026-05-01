// Frame Ops Web — /api/hq/stats
// GET ?from=&to=&store_id= → 본사 통합 통계 (전체 또는 단일 매장)

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
  if (!session.role_code.startsWith('hq_')) {
    return NextResponse.json({ data: null, error: '본사 권한이 필요합니다.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const storeId = url.searchParams.get('store_id') || null;

  const db = getDB();
  const { data, error } = await (db.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    'get_hq_sales_stats',
    { p_from: from, p_to: to, p_store_id: storeId }
  );

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 매장 옵션 (필터 dropdown)
  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name, active')
    .eq('active', true)
    .order('store_code', { ascending: true });

  // 환불 보정 — RPC 결과의 매출 관련 필드에서 차감.
  const returns = await fetchReturnsTotals(db, from, to, storeId);
  const dataObj = (data ?? {}) as Record<string, unknown>;
  // 매출 합계가 있는 필드 발견 시 차감 시도 (안전한 키만)
  const tryDeduct = (key: string, sub: number) => {
    const v = dataObj[key];
    if (typeof v === 'number') dataObj[key] = v - sub;
  };
  tryDeduct('total_revenue', returns.amount);
  tryDeduct('total_cash', returns.cashRefund);
  tryDeduct('total_card', returns.cardRefund);
  tryDeduct('item_count', returns.qty);

  return NextResponse.json({
    data: {
      ...dataObj,
      stores: stores ?? [],
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
