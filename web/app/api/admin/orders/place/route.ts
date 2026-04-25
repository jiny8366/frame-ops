// Frame Ops Web — /api/admin/orders/place
// POST { supplier_id, from, to } → 매입처+기간 매칭 항목들을 발주 확정 (ordered_at 마킹)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface PlaceBody {
  supplier_id: string;
  from: string;
  to: string;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PlaceBody;
    if (!body.supplier_id || !body.from || !body.to) {
      return NextResponse.json(
        { data: null, error: 'supplier_id, from, to 가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = getDB();
    const { data, error } = await db.rpc('mark_orders_placed', {
      p_store_id: session.store_id,
      p_supplier_id: body.supplier_id,
      p_from: body.from,
      p_to: body.to,
      p_user_id: session.staff_user_id,
    });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: { marked: data ?? 0 }, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
