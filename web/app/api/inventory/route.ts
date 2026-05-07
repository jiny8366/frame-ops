// Frame Ops Web — /api/inventory
// GET: 재고 조회 — `get_inventory_computed` RPC (표시 현재고=stock_quantity, computed_stock 은 참고용).
// 매장 단위(현재 세션) 집계.

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

/** Vercel/브라우저 계층 캐시로 목록이 옛 데이터로 남는 것 방지 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
} as const;

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
      return NextResponse.json(
        { data: null, error: '로그인이 필요합니다.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
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
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { data: data ?? [], error: null },
      { headers: NO_STORE_HEADERS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { data: null, error: msg },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
