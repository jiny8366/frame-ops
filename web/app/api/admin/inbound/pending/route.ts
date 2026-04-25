// Frame Ops Web — /api/admin/inbound/pending
// GET ?supplier_id=...  → 매입 대기 제품 (재고 < 0) 리스트, 매입처 매핑 필터
// PATCH                 → 보류 플래그 토글 (product_id, hold)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const supplierId = url.searchParams.get('supplier_id') || null;

  const db = getDB();
  const { data, error } = await db.rpc('get_pending_for_inbound', {
    p_supplier_id: supplierId,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], error: null });
}

interface PatchBody {
  product_id: string;
  hold: boolean;
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PatchBody;
    if (!body.product_id || typeof body.hold !== 'boolean') {
      return NextResponse.json(
        { data: null, error: 'product_id, hold (boolean) 이 필요합니다.' },
        { status: 400 }
      );
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_products')
      .update({ inbound_hold: body.hold })
      .eq('id', body.product_id)
      .select('id, inbound_hold')
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
