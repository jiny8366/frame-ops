// Frame Ops Web — /api/admin/transfers/[id]
// GET: 단일 점간이동 상세
// PATCH: 헤더 수정 (note, document_at, status)
// DELETE: 전표 + 모든 라인 삭제

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

function isHqRole(role: string): boolean {
  return role.startsWith('hq_');
}

interface PatchBody {
  document_at?: string;
  note?: string | null;
  status?: string;
}

async function ensureScope(
  receiptId: string,
  storeId: string,
  isHq: boolean
): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const db = getDB();
  const { data } = await db
    .from('fo_interstore_transfers')
    .select('id, from_store_id, to_store_id')
    .eq('id', receiptId)
    .maybeSingle();
  if (!data) return { ok: false, status: 404, msg: '전표를 찾을 수 없습니다.' };
  if (isHq) return { ok: true };
  if (data.from_store_id !== storeId && data.to_store_id !== storeId) {
    return { ok: false, status: 403, msg: '본인 매장 관련 전표만 다룰 수 있습니다.' };
  }
  return { ok: true };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await params;
  const guard = await ensureScope(id, session.store_id, isHqRole(session.role_code));
  if (!guard.ok)
    return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  const db = getDB();
  const { data, error } = await db
    .from('fo_interstore_transfers')
    .select(
      `id, document_at, note, status, created_at, decided_at,
       from_store_id, to_store_id,
       from_store:fo_stores!fo_interstore_transfers_from_store_id_fkey(id, store_code, name),
       to_store:fo_stores!fo_interstore_transfers_to_store_id_fkey(id, store_code, name),
       lines:fo_interstore_transfer_lines(
         id, product_id, quantity, unit_cost,
         product:fo_products(id, product_code, style_code, color_code, category, product_line,
           cost_price, brand_id, brand:fo_brands(name))
       )`
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await params;
  const guard = await ensureScope(id, session.store_id, isHqRole(session.role_code));
  if (!guard.ok)
    return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  try {
    const body = (await request.json()) as PatchBody;
    const update: PatchBody = {};
    if (body.document_at !== undefined) update.document_at = body.document_at;
    if (body.note !== undefined) update.note = body.note;
    if (body.status !== undefined) update.status = body.status;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 값이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_interstore_transfers')
      .update(update)
      .eq('id', id)
      .select('id, document_at, note, status')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await params;
  const guard = await ensureScope(id, session.store_id, isHqRole(session.role_code));
  if (!guard.ok)
    return NextResponse.json({ data: null, error: guard.msg }, { status: guard.status });

  const db = getDB();
  // 라인 먼저 삭제
  const { error: lErr } = await db
    .from('fo_interstore_transfer_lines')
    .delete()
    .eq('transfer_id', id);
  if (lErr) return NextResponse.json({ data: null, error: lErr.message }, { status: 500 });

  const { error: hErr } = await db.from('fo_interstore_transfers').delete().eq('id', id);
  if (hErr) return NextResponse.json({ data: null, error: hErr.message }, { status: 500 });
  return NextResponse.json({ data: { id }, error: null });
}
