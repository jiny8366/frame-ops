// Frame Ops Web — /api/inventory/[id]/stock
// PATCH: 단일 상품의 stock_quantity 수정. inventory_edit_stock 권한 필요.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

interface PatchBody {
  stock_quantity: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'inventory_edit_stock')) {
    return NextResponse.json(
      { data: null, error: '재고 수량 수정 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as PatchBody;
    if (typeof body.stock_quantity !== 'number' || !Number.isFinite(body.stock_quantity)) {
      return NextResponse.json(
        { data: null, error: 'stock_quantity 는 숫자여야 합니다.' },
        { status: 400 }
      );
    }
    const qty = Math.round(body.stock_quantity);

    const db = getDB();
    const { data, error } = await db
      .from('fo_products')
      .update({ stock_quantity: qty })
      .eq('id', id)
      .select('id, stock_quantity')
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
