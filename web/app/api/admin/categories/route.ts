// Frame Ops Web — /api/admin/categories
// fo_product_categories: 상품 카테고리(소재) 마스터.
// label + code (3자 영문 약자)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { normalizeShortCode } from '@/lib/product-codes';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const db = getDB();
  const { data, error } = await db
    .from('fo_product_categories')
    .select('id, label, code, sort_order')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      label: string;
      code?: string;
      sort_order?: number;
    };
    const label = (body.label ?? '').trim();
    if (!label) {
      return NextResponse.json({ data: null, error: '이름이 필요합니다.' }, { status: 400 });
    }
    const code = body.code ? normalizeShortCode(body.code) : normalizeShortCode(label);

    const db = getDB();
    const { data, error } = await db
      .from('fo_product_categories')
      .insert({ label, code, sort_order: body.sort_order ?? 200 })
      .select('id, label, code, sort_order')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
