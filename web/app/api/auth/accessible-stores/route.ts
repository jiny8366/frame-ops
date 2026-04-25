// Frame Ops Web — /api/auth/accessible-stores (GET)
// 현재 사용자가 접근 가능한 매장 리스트.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { listAccessibleStores } from '@/lib/auth/accessible-stores';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const db = getDB();
  const stores = await listAccessibleStores(db, session.staff_user_id, session.role_code);
  return NextResponse.json({
    data: { stores, current_store_id: session.store_id },
    error: null,
  });
}
