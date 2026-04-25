// Frame Ops Web — /api/admin/staff/roles
// 역할/직급 코드 마스터 동시 반환 (드롭다운용).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const [rolesRes, titlesRes] = await Promise.all([
    db
      .from('fo_staff_roles')
      .select('code, label, sort_order')
      .order('sort_order', { ascending: true }),
    db
      .from('fo_staff_job_titles')
      .select('code, label, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ]);

  return NextResponse.json({
    data: {
      roles: rolesRes.data ?? [],
      job_titles: titlesRes.data ?? [],
    },
    error: null,
  });
}
