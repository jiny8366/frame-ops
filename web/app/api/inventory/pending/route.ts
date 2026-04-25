// Frame Ops Web — /api/inventory/pending (GET)
// RPC get_pending_stock_items 호출. stock_quantity < 0 인 활성 제품 = 매입 대기.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET() {
  try {
    const db = getDB();
    const { data, error } = await db.rpc('get_pending_stock_items');

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { data, error: null },
      {
        headers: {
          // 발주 대기는 실시간성이 중요 — 짧은 캐시 + SWR
          'Cache-Control': 's-maxage=5, stale-while-revalidate=30',
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
