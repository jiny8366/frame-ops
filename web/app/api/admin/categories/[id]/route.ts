// Frame Ops Web — /api/admin/categories/[id]
// PATCH: 카테고리 label/code/sort_order 수정.
// DELETE: 사용 중이면 거부, 아니면 삭제.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { normalizeShortCode } from '@/lib/product-codes';

interface PatchBody {
  label?: string;
  code?: string | null;
  sort_order?: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = (await request.json()) as PatchBody;
    const update: { label?: string; code?: string | null; sort_order?: number } = {};
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ data: null, error: '이름이 필요합니다.' }, { status: 400 });
      }
      update.label = label;
    }
    if (body.code !== undefined) {
      update.code = body.code ? normalizeShortCode(body.code) : null;
    }
    if (body.sort_order !== undefined) update.sort_order = body.sort_order;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 값이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_product_categories')
      .update(update)
      .eq('id', id)
      .select('id, label, code, sort_order')
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
  const { id } = await params;
  const db = getDB();

  // 카테고리 라벨 조회 → 해당 라벨로 등록된 상품이 있으면 차단.
  const { data: cat } = await db
    .from('fo_product_categories')
    .select('label')
    .eq('id', id)
    .maybeSingle();
  if (!cat) {
    return NextResponse.json({ data: null, error: '카테고리를 찾을 수 없습니다.' }, { status: 404 });
  }
  const { count } = await db
    .from('fo_products')
    .select('id', { count: 'exact', head: true })
    .eq('category', cat.label);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { data: null, error: `사용 중인 카테고리입니다 (상품 ${count}건). 먼저 상품을 다른 카테고리로 이동해 주세요.` },
      { status: 409 }
    );
  }

  const { error } = await db.from('fo_product_categories').delete().eq('id', id);
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: { id }, error: null });
}
