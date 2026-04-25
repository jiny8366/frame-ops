// Frame Ops Web — /api/admin/suppliers
// GET: 활성 매입처 리스트 (드롭다운용).

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
    .from('fo_suppliers')
    .select('id, supplier_code, name, contact, business_number, active')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}
