// Frame Ops Web — /api/admin/orders/pending
// GET ?from=&to= → 미발주 sale_items 를 매입처별·제품 단위 합산.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();

  const db = getDB();
  const { data, error } = await db.rpc('get_pending_orders', {
    p_store_id: session.store_id,
    p_from: from,
    p_to: to,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 응답: { period, store, groups: [{supplier, items, totals}] }
  const rows = data ?? [];
  const groupsMap = new Map<
    string,
    {
      supplier_id: string;
      supplier_name: string;
      supplier_code: string | null;
      items: typeof rows;
      total_quantity: number;
      total_revenue: number;
      total_cost: number;
    }
  >();

  for (const r of rows) {
    let g = groupsMap.get(r.supplier_id);
    if (!g) {
      g = {
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        supplier_code: r.supplier_code,
        items: [],
        total_quantity: 0,
        total_revenue: 0,
        total_cost: 0,
      };
      groupsMap.set(r.supplier_id, g);
    }
    g.items.push(r);
    g.total_quantity += r.total_quantity;
    g.total_revenue += r.total_quantity * r.unit_price;
    g.total_cost += r.total_quantity * r.cost_price;
  }

  // 매장 정보
  const { data: store } = await db
    .from('fo_stores')
    .select('id, store_code, name, address, phone, business_reg_no')
    .eq('id', session.store_id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      period: { from, to },
      store,
      groups: Array.from(groupsMap.values()),
    },
    error: null,
  });
}
