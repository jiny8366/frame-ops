// Frame Ops Web — /api/hq/dashboard
// 전 매장 오늘 매출 요약. middleware 가 hq_* 만 통과시킴.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const today = new Date().toISOString().slice(0, 10);

  // 모든 활성 매장
  const { data: stores, error: storeErr } = await db
    .from('fo_stores')
    .select('id, store_code, name')
    .eq('active', true)
    .order('store_code', { ascending: true });

  if (storeErr) {
    return NextResponse.json({ data: null, error: storeErr.message }, { status: 500 });
  }

  // 오늘 판매 (모든 매장)
  const { data: sales } = await db
    .from('fo_sales')
    .select('store_id, cash_amount, card_amount, discount_total')
    .gte('sold_at', `${today}T00:00:00Z`)
    .lte('sold_at', `${today}T23:59:59Z`);

  // 매장별 합계
  const perStore = new Map<
    string,
    { cash: number; card: number; revenue: number; count: number }
  >();
  for (const s of sales ?? []) {
    const key = s.store_id;
    const slot = perStore.get(key) ?? { cash: 0, card: 0, revenue: 0, count: 0 };
    slot.cash += s.cash_amount;
    slot.card += s.card_amount;
    slot.revenue += s.cash_amount + s.card_amount - s.discount_total;
    slot.count += 1;
    perStore.set(key, slot);
  }

  const items = (stores ?? []).map((st) => {
    const agg = perStore.get(st.id) ?? { cash: 0, card: 0, revenue: 0, count: 0 };
    return {
      store_id: st.id,
      store_code: st.store_code,
      store_name: st.name,
      ...agg,
    };
  });

  const total = items.reduce(
    (acc, it) => ({
      cash: acc.cash + it.cash,
      card: acc.card + it.card,
      revenue: acc.revenue + it.revenue,
      count: acc.count + it.count,
    }),
    { cash: 0, card: 0, revenue: 0, count: 0 }
  );

  return NextResponse.json({
    data: { today, total, stores: items },
    error: null,
  });
}
