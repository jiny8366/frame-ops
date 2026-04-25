// Frame Ops Web — /api/auth/me (GET)
// 현재 세션 + 매장명 반환. 비로그인 시 data=null.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: null });
  }

  const db = getDB();
  const { data: store } = await db
    .from('fo_stores')
    .select('name')
    .eq('id', session.store_id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      staff_user_id: session.staff_user_id,
      display_name: session.display_name,
      role_code: session.role_code,
      permissions: session.permissions,
      store_id: session.store_id,
      store_code: session.store_code,
      store_name: store?.name ?? session.store_code,
    },
    error: null,
  });
}
