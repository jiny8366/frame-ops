// Frame Ops Web — /api/admin/categories/[id]
// 카테고리(소재) 단건 수정.
// label / code / sort_order 변경 가능.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { normalizeShortCode } from '@/lib/product-codes';

interface UpdateBody {
  label?: string;
  code?: string;
  sort_order?: number;
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!params.id) {
    return NextResponse.json({ data: null, error: 'id 가 필요합니다.' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as UpdateBody;
    const patch: { label?: string; code?: string | null; sort_order?: number } = {};

    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) {
        return NextResponse.json({ data: null, error: '이름이 필요합니다.' }, { status: 400 });
      }
      patch.label = label;
    }
    if (body.code !== undefined) {
      patch.code = body.code ? normalizeShortCode(body.code) : null;
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = body.sort_order;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ data: null, error: '변경 사항이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_product_categories')
      .update(patch)
      .eq('id', params.id)
      .select('id, label, code, sort_order')
      .single();

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
