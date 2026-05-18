// Frame Ops Web — /api/hq/stats
// GET ?from=&to=&store_id= → 본사 통합 통계 (전체 또는 단일 매장)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';
import { enforceRevenue } from '@/lib/sales-revenue';

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
  // 환불 보정 — cash/card 만 차감, revenue 는 cash + card 로 항상 재계산 (lib/sales-revenue).
  // revenue 에 returns.amount(라인 합) 를 따로 빼는 이전 방식은 할인/메타 불일치 시 어긋남.
  if (dataObj.summary && typeof dataObj.summary === 'object') {
    const s = dataObj.summary as Record<string, number | null | undefined> & { quantity?: number };
    if (typeof s.cash === 'number') s.cash = s.cash - periodReturns.cashRefund;
    if (typeof s.card === 'number') s.card = s.card - periodReturns.cardRefund;
    if (typeof s.quantity === 'number') s.quantity = s.quantity - periodReturns.qty;
    enforceRevenue(s as unknown as { cash?: number; card?: number; revenue?: number }, 'hq/stats.summary');
  }
  if (dataObj.month && typeof dataObj.month === 'object') {
    const m = dataObj.month as Record<string, number | null | undefined>;
    if (typeof m.cash === 'number') m.cash = m.cash - monthReturns.cashRefund;
    if (typeof m.card === 'number') m.card = m.card - monthReturns.cardRefund;
    enforceRevenue(m as unknown as { cash?: number; card?: number; revenue?: number }, 'hq/stats.month');
  }
  if (Array.isArray(dataObj.by_store) && !storeId) {
    const byStore = dataObj.by_store as Array<Record<string, number | null | undefined> & { store_id?: string; quantity?: number }>;
    for (const row of byStore) {
      const sid = row.store_id;
      if (!sid) continue;
      const sr = await fetchReturnsTotals(db, from, to, sid);
      if (typeof row.cash === 'number') row.cash = row.cash - sr.cashRefund;
      if (typeof row.card === 'number') row.card = row.card - sr.cardRefund;
      if (typeof row.quantity === 'number') row.quantity = row.quantity - sr.qty;
      enforceRevenue(row as unknown as { cash?: number; card?: number; revenue?: number }, `hq/stats.by_store[${sid}]`);
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
