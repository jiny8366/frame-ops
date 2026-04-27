// Frame Ops Web — /api/inventory
// GET: 재고 조회 — 매입 누계 - 판매 누계 = 계산 재고.
// 매장 단위(현재 세션) 집계.

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface InventoryRow {
  id: string;
  product_code: string;
  brand_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  category: string | null;
  product_line: string | null;
  cost_price: number;
  sale_price: number;
  total_inbound: number;
  total_sold: number;
  computed_stock: number;
  stock_quantity: number;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 1000), 2000);

    const db = getDB();
    const { data, error } = await (db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: InventoryRow[] | null; error: { message: string } | null }>)(
      'get_inventory_computed',
      { p_store_id: session.store_id, p_limit: limit }
    );

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
