// Frame Ops Web — /api/hq/dashboard v2
// 매장 필터 또는 전체 + 시간대별 그래프 + 판매 상품 리스트.

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

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store_id') || null;
  const date = url.searchParams.get('date') || todayDate();

  const db = getDB();

  // 매장 리스트 (셀렉터용)
  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name')
    .eq('active', true)
    .order('store_code', { ascending: true });

  const { data: rpcData, error } = await db.rpc('get_hq_dashboard_v2', {
    p_store_id: storeId,
    p_date: date,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const result = rpcData as unknown as {
    summary: DashboardSummary;
    hourly: HourlyPoint[];
    products: ProductRow[];
  };

  return NextResponse.json({
    data: {
      date,
      store_id: storeId,
      stores: stores ?? [],
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
