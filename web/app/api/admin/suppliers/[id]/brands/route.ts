// Frame Ops Web — /api/admin/suppliers/[id]/brands
// GET: 해당 매입처의 매핑된 브랜드 ID 리스트
// PUT: 매핑 일괄 갱신 (body.brand_ids 배열로 통째 교체)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  const db = getDB();
  const { data, error } = await db
    .from('fo_supplier_brands')
    .select('brand_id')
    .eq('supplier_id', id);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: (data ?? []).map((r) => r.brand_id), error: null });
}

interface PutBody {
  brand_ids: string[];
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = (await request.json()) as PutBody;
    const next = Array.isArray(body.brand_ids) ? body.brand_ids : [];

    const db = getDB();
    // 현재 매핑 조회
    const { data: current } = await db
      .from('fo_supplier_brands')
      .select('brand_id')
      .eq('supplier_id', id);
    const currentSet = new Set((current ?? []).map((r) => r.brand_id));
    const nextSet = new Set(next);

    const toAdd = next.filter((b) => !currentSet.has(b));
    const toRemove = Array.from(currentSet).filter((b) => !nextSet.has(b));

    if (toRemove.length > 0) {
      const { error } = await db
        .from('fo_supplier_brands')
        .delete()
        .eq('supplier_id', id)
        .in('brand_id', toRemove);
      if (error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    if (toAdd.length > 0) {
      const { error } = await db
        .from('fo_supplier_brands')
        .insert(toAdd.map((b) => ({ supplier_id: id, brand_id: b })));
      if (error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: { added: toAdd.length, removed: toRemove.length, total: next.length },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
