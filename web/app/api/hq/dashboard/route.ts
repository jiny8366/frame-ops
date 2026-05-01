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

  // 환불 보정 — 직전 12시간 윈도우의 fo_returns 를 차감.
  // RPC 가 fo_returns 미반영 → 클라이언트(API) 측에서 차감 후 반환.
  const winStart = result?.window_start ?? null;
  const winEnd = result?.window_end ?? new Date().toISOString();
  let returnsAdjusted: {
    count: number;
    items: number;
    qty: number;
    amount: number;
  } = { count: 0, items: 0, qty: 0, amount: 0 };
  if (winStart) {
    // window_start/end 가 ISO timestamp 일 수 있음 → 날짜 부분만 추출하여 fetchReturnsTotals 사용
    const fromDate = winStart.slice(0, 10);
    const toDate = winEnd.slice(0, 10);
    const r = await fetchReturnsTotals(db, fromDate, toDate, storeId);
    returnsAdjusted = {
      count: r.count,
      items: r.itemsCount,
      qty: r.qty,
      amount: r.amount,
    };
  }
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
