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

    // RPC 미반환 필드(product_line, category) 보강 — fo_products 별도 조회 후 머지.
    type Row = (typeof data extends Array<infer R> ? R : never) & {
      product_line?: string | null;
      category?: string | null;
    };
    const rows = (data ?? []) as Row[];
    const productIds = Array.from(new Set(rows.map((r) => r.id)));
    if (productIds.length > 0) {
      const { data: meta } = await db
        .from('fo_products')
        .select('id, product_line, category')
        .in('id', productIds);
      const m = new Map((meta ?? []).map((p) => [p.id, p]));
      for (const r of rows) {
        const found = m.get(r.id);
        r.product_line = found?.product_line ?? null;
        r.category = found?.category ?? null;
      }
    }

    return NextResponse.json(
      { data: rows, error: null },
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
