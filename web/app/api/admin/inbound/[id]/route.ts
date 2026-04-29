// Frame Ops Web — /api/admin/inbound/[id]
// GET: 단일 매입전표 + 라인 상세
// PATCH: 헤더 수정 (supplier_id, document_at, note)
// DELETE: 전표 + 모든 라인 삭제 + 재고 차감

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

async function ensureScope(receiptId: string, storeId: string) {
  const db = getDB();
  const { data } = await db
    .from('fo_inbound_receipts')
    .select('id, store_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (!data) return { ok: false, status: 404, msg: '전표를 찾을 수 없습니다.' };
  if (data.store_id !== storeId) {
    return { ok: false, status: 403, msg: '다른 매장의 전표는 수정할 수 없습니다.' };
  }
  return { ok: true as const };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  const db = getDB();
  const { data, error } = await db
    .from('fo_inbound_receipts')
    .select(
      `id, document_at, note, created_at, supplier_id, store_id,
       supplier:fo_suppliers(name, supplier_code),
       lines:fo_inbound_lines(
         id, product_id, quantity, unit_cost,
         product:fo_products(id, product_code, display_name, brand_id, style_code, color_code, category, sale_price, cost_price,
           brand:fo_brands(name))
       )`
    )
    .eq('id', id)
    .eq('store_id', session.store_id)
    .maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: '전표를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ data, error: null });
}

interface PatchBody {
  supplier_id?: string | null;
  document_at?: string;
  note?: string | null;
}

type ReceiptUpdate = {
  supplier_id?: string | null;
  document_at?: string;
  note?: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  const guard = await ensureScope(id, session.store_id);
  if (!guard.ok) return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  try {
    const body = (await request.json()) as PatchBody;
    const update: ReceiptUpdate = {};
    if (body.supplier_id !== undefined) update.supplier_id = body.supplier_id;
    if (body.document_at !== undefined && body.document_at !== null) {
      update.document_at = body.document_at;
    }
    if (body.note !== undefined) update.note = body.note;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 값이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_inbound_receipts')
      .update(update)
      .eq('id', id)
      .select('id, document_at, note, supplier_id')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

// 전표 통째 삭제: 모든 라인의 (product_id, quantity) 만큼 fo_products.stock_quantity 차감 후 라인·헤더 삭제.
// 주의: 트랜잭션 미보장(여러 단계). 운영 RPC 가 추가될 때까지 best-effort.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  const guard = await ensureScope(id, session.store_id);
  if (!guard.ok) return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  const db = getDB();
  // 1) 라인 조회
  const { data: lines, error: linesErr } = await db
    .from('fo_inbound_lines')
    .select('id, product_id, quantity')
    .eq('inbound_receipt_id', id);
  if (linesErr) return NextResponse.json({ data: null, error: linesErr.message }, { status: 500 });

  // 2) 각 product 의 stock_quantity 를 quantity 만큼 차감
  for (const l of lines ?? []) {
    const { data: prod } = await db
      .from('fo_products')
      .select('stock_quantity')
      .eq('id', l.product_id)
      .maybeSingle();
    const cur = prod?.stock_quantity ?? 0;
    await db
      .from('fo_products')
      .update({ stock_quantity: Math.max(0, cur - l.quantity) })
      .eq('id', l.product_id);
  }

  // 3) 라인 삭제
  const { error: dlErr } = await db.from('fo_inbound_lines').delete().eq('inbound_receipt_id', id);
  if (dlErr) return NextResponse.json({ data: null, error: dlErr.message }, { status: 500 });

  // 4) 헤더 삭제
  const { error: dhErr } = await db.from('fo_inbound_receipts').delete().eq('id', id);
  if (dhErr) return NextResponse.json({ data: null, error: dhErr.message }, { status: 500 });

  return NextResponse.json({ data: { id, lines_removed: lines?.length ?? 0 }, error: null });
}
