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

  // 환불 보정 — 기간 내 + 당월 환불 차감.
  // RPC 반환 구조: { summary: {cash, card, revenue, count, quantity}, month: {cash, card, revenue, count}, by_store: [...] }
  const periodReturns = await fetchReturnsTotals(db, from, to, storeId);
  const seoulNow = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  );
  const monthStart = `${seoulNow.getFullYear()}-${String(seoulNow.getMonth() + 1).padStart(2, '0')}-01`;
  const monthReturns = await fetchReturnsTotals(db, monthStart, to, storeId);

  const dataObj = (data ?? {}) as Record<string, unknown>;
  // summary (기간) 차감
  if (dataObj.summary && typeof dataObj.summary === 'object') {
    const s = dataObj.summary as Record<string, unknown>;
    if (typeof s.revenue === 'number') s.revenue = s.revenue - periodReturns.amount;
    if (typeof s.cash === 'number') s.cash = s.cash - periodReturns.cashRefund;
    if (typeof s.card === 'number') s.card = s.card - periodReturns.cardRefund;
    if (typeof s.quantity === 'number') s.quantity = s.quantity - periodReturns.qty;
  }
  // month (당월 누적) 차감
  if (dataObj.month && typeof dataObj.month === 'object') {
    const m = dataObj.month as Record<string, unknown>;
    if (typeof m.revenue === 'number') m.revenue = m.revenue - monthReturns.amount;
    if (typeof m.cash === 'number') m.cash = m.cash - monthReturns.cashRefund;
    if (typeof m.card === 'number') m.card = m.card - monthReturns.cardRefund;
  }
  // by_store 행 — 매장별 매출에서 차감 (기간 환불을 매장별로 분배 — fetchReturnsTotals 는 storeId 인자에 따라 이미 필터됨)
  // storeId 가 null(전 매장)이면 by_store 항목별로 별도 조회 필요
  if (Array.isArray(dataObj.by_store) && !storeId) {
    const byStore = dataObj.by_store as Array<Record<string, unknown>>;
    for (const row of byStore) {
      const sid = row.store_id as string | undefined;
      if (!sid) continue;
      const sr = await fetchReturnsTotals(db, from, to, sid);
      if (typeof row.revenue === 'number') row.revenue = row.revenue - sr.amount;
      if (typeof row.cash === 'number') row.cash = row.cash - sr.cashRefund;
      if (typeof row.card === 'number') row.card = row.card - sr.cardRefund;
      if (typeof row.quantity === 'number') row.quantity = row.quantity - sr.qty;
    }
  }

  return NextResponse.json({
    data: {
      ...dataObj,
      stores: stores ?? [],
      returns_summary: {
        count: periodReturns.count,
        items: periodReturns.itemsCount,
        qty: periodReturns.qty,
        amount: periodReturns.amount,
        cash_refund: periodReturns.cashRefund,
        card_refund: periodReturns.cardRefund,
      },
    },
    error: null,
  });
}
