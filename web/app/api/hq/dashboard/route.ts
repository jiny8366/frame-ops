// Frame Ops Web — /api/hq/dashboard v3
// 시간대별 매출·수량 = 현재 시점 직전 12시간 (날짜 지정 없음)
// 매장 셀렉터로 전체 또는 단일 매장.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

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

  return NextResponse.json({
    data: {
      store_id: storeId,
      stores: stores ?? [],
      window_start: result?.window_start ?? null,
      window_end: result?.window_end ?? null,
      summary: result?.summary ?? {
        revenue: 0,
        cost: 0,
        profit: 0,
        sale_count: 0,
        item_count: 0,
      },
      hourly: result?.hourly ?? [],
      products: result?.products ?? [],
    },
    error: null,
  });
}
