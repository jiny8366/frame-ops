// Frame Ops Web — /api/admin/inbound/lines/[line_id]
// PATCH: 단일 매입 라인 수정 (quantity / unit_cost). 수량 변경 시 fo_products.stock_quantity 델타 보정.
// DELETE: 단일 라인 삭제. 수량만큼 stock_quantity 차감.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface LineRow {
  id: string;
  inbound_receipt_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
}

async function loadLineWithScope(lineId: string, storeId: string) {
  const db = getDB();
  const { data: line } = await db
    .from('fo_inbound_lines')
    .select('id, inbound_receipt_id, product_id, quantity, unit_cost')
    .eq('id', lineId)
    .maybeSingle();
  if (!line) return { ok: false as const, status: 404, msg: '라인을 찾을 수 없습니다.' };
  const { data: receipt } = await db
    .from('fo_inbound_receipts')
    .select('store_id')
    .eq('id', line.inbound_receipt_id)
    .maybeSingle();
  if (receipt?.store_id !== storeId) {
    return { ok: false as const, status: 403, msg: '다른 매장의 라인은 수정할 수 없습니다.' };
  }
  return { ok: true as const, line: line as LineRow };
}

async function adjustStock(productId: string, delta: number) {
  if (delta === 0) return;
  const db = getDB();
  const { data: prod } = await db
    .from('fo_products')
    .select('stock_quantity')
    .eq('id', productId)
    .maybeSingle();
  const cur = prod?.stock_quantity ?? 0;
  await db
    .from('fo_products')
    .update({ stock_quantity: Math.max(0, cur + delta) })
    .eq('id', productId);
}

interface PatchBody {
  quantity?: number;
  unit_cost?: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ line_id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { line_id } = await params;
  const guard = await loadLineWithScope(line_id, session.store_id);
  if (!guard.ok) return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  try {
    const body = (await request.json()) as PatchBody;
    const update: { quantity?: number; unit_cost?: number } = {};
    if (body.quantity !== undefined) {
      if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
        return NextResponse.json({ data: null, error: '수량은 1 이상이어야 합니다.' }, { status: 400 });
      }
      update.quantity = Math.floor(body.quantity);
    }
    if (body.unit_cost !== undefined) {
      if (!Number.isFinite(body.unit_cost) || body.unit_cost < 0) {
        return NextResponse.json({ data: null, error: '단가는 0 이상이어야 합니다.' }, { status: 400 });
      }
      update.unit_cost = body.unit_cost;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 값이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data: updated, error } = await db
      .from('fo_inbound_lines')
      .update(update)
      .eq('id', line_id)
      .select('id, inbound_receipt_id, product_id, quantity, unit_cost')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

    // 수량 델타 만큼 stock 보정
    if (update.quantity !== undefined && update.quantity !== guard.line.quantity) {
      const delta = update.quantity - guard.line.quantity;
      await adjustStock(guard.line.product_id, delta);
    }

    return NextResponse.json({ data: updated, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ line_id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { line_id } = await params;
  const guard = await loadLineWithScope(line_id, session.store_id);
  if (!guard.ok) return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  const db = getDB();
  const { error } = await db.from('fo_inbound_lines').delete().eq('id', line_id);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  // stock 차감
  await adjustStock(guard.line.product_id, -guard.line.quantity);

  return NextResponse.json({ data: { id: line_id }, error: null });
}
