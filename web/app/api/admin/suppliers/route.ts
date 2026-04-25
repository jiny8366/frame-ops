// Frame Ops Web — /api/admin/suppliers
// GET ?include_inactive=1 → 매입처 리스트
// POST                    → 신규 매입처 생성

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get('include_inactive') === '1';

  const db = getDB();
  let query = db
    .from('fo_suppliers')
    .select('id, supplier_code, name, contact, business_number, address, memo, active, created_at')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (!includeInactive) query = query.eq('active', true);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

interface CreateBody {
  name: string;
  supplier_code?: string | null;
  contact?: string | null;
  business_number?: string | null;
  address?: string | null;
  memo?: string | null;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreateBody;
    const name = (body.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ data: null, error: '매입처명은 필수입니다.' }, { status: 400 });
    }
    const db = getDB();
    const { data, error } = await db
      .from('fo_suppliers')
      .insert({
        name,
        supplier_code: body.supplier_code?.trim() || null,
        contact: body.contact?.trim() || null,
        business_number: body.business_number?.trim() || null,
        address: body.address?.trim() || null,
        memo: body.memo?.trim() || null,
        active: true,
      })
      .select('id, supplier_code, name, contact, business_number, address, memo, active')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
