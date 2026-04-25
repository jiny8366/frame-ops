// Frame Ops Web — /api/admin/brands
// GET: 전체 브랜드 리스트 (이름 오름차순)
// POST: 신규 브랜드 추가

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const { data, error } = await db
    .from('fo_brands')
    .select('id, name, created_at')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { name: string };
    const name = (body.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ data: null, error: '이름은 필수입니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_brands')
      .insert({ name })
      .select('id, name, created_at')
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
