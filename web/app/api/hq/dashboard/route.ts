// Frame Ops Web — /api/hq/dashboard v3
// 시간대별 매출·수량 = 현재 시점 직전 12시간 (날짜 지정 없음)
// 매장 셀렉터로 전체 또는 단일 매장.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';

interface DashboardSummary {
  revenue: number;
  cost: number;
  profit: number;
  sale_count: number;
  item_count: number;
}

interface HourlyPoint {
  hour: number;
  label: string;
  revenue: number;
  qty: number;
}

interface ProductRow {
  product_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  quantity: number;
  revenue: number;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store_id') || null;

  const db = getDB();

  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name')
    .eq('active', true)
    .order('store_code', { ascending: true });

  const { data: rpcData, error } = await db.rpc('get_hq_dashboard_v3', {
    p_store_id: storeId,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const result = rpcData as unknown as {
    summary: DashboardSummary;
    hourly: HourlyPoint[];
    products: ProductRow[];
    window_start: string;
    window_end: string;
  };

  // 환불 보정 — 직전 12시간 윈도우의 fo_returns 차감.
  // window_start 가 RPC 결과에 없을 수 있으므로 fallback: 현재 시각 기준 -12h.
  const nowMs = Date.now();
  const winStartIso = result?.window_start ?? new Date(nowMs - 12 * 60 * 60 * 1000).toISOString();
  const winEndIso = result?.window_end ?? new Date(nowMs).toISOString();

  // returned_at 정확한 시간 비교를 위해 직접 supabase 쿼리 (날짜 단위 fetchReturnsTotals 대신 시각 단위)
  let retQ = db
    .from('fo_returns')
    .select('id, note, store_id, returned_at')
    .gte('returned_at', winStartIso)
    .lte('returned_at', winEndIso);
  if (storeId) retQ = retQ.eq('store_id', storeId);
  const { data: retList } = await retQ;
  let retAmount = 0;
  let retQty = 0;
  let retItems = 0;
  if (retList && retList.length > 0) {
    const { data: rLines } = await db
      .from('fo_return_lines')
      .select('quantity, unit_price, return_id')
      .in('return_id', retList.map((r) => r.id));
    for (const l of rLines ?? []) {
      retItems += 1;
      retQty += l.quantity;
      retAmount += l.quantity * l.unit_price;
    }
  }
  const returnsAdjusted = {
    count: retList?.length ?? 0,
    items: retItems,
    qty: retQty,
    amount: retAmount,
  };

  const baseSummary = result?.summary ?? {
    revenue: 0,
    cost: 0,
    profit: 0,
    sale_count: 0,
    item_count: 0,
  };
  const adjSummary = {
    revenue: baseSummary.revenue - returnsAdjusted.amount,
    cost: baseSummary.cost,
    profit: baseSummary.profit - returnsAdjusted.amount,
    sale_count: baseSummary.sale_count,
    item_count: baseSummary.item_count - returnsAdjusted.qty,
  };

  return NextResponse.json({
    data: {
      store_id: storeId,
      stores: stores ?? [],
      window_start: result?.window_start ?? null,
      window_end: result?.window_end ?? null,
      summary: adjSummary,
      hourly: result?.hourly ?? [],
      products: result?.products ?? [],
      returns_summary: returnsAdjusted,
    },
    error: null,
  });
}
