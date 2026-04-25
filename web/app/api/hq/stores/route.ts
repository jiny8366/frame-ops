// Frame Ops Web — /api/hq/stores
// GET: 전 매장 리스트 (활성/비활성 모두)
// POST: 신규 매장 등록

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
    .from('fo_stores')
    .select('id, store_code, name, address, phone, business_reg_no, active, created_at')
    .order('active', { ascending: false })
    .order('store_code', { ascending: true });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

interface CreateBody {
  store_code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  business_reg_no?: string | null;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreateBody;
    const code = (body.store_code ?? '').trim().toUpperCase();
    const name = (body.name ?? '').trim();
    if (!code || !name) {
      return NextResponse.json(
        { data: null, error: '매장 코드와 매장명은 필수입니다.' },
        { status: 400 }
      );
    }
    const db = getDB();
    const { data, error } = await db
      .from('fo_stores')
      .insert({
        store_code: code,
        name,
        address: body.address?.trim() ?? undefined,
        phone: body.phone?.trim() ?? undefined,
        business_reg_no: body.business_reg_no?.trim() ?? undefined,
        active: true,
      })
      .select('id, store_code, name, address, phone, business_reg_no, active')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
