// Frame Ops Web — /api/auth/switch-store (POST)
// 입력: { store_id }
// 처리: 현재 사용자가 그 매장에 접근 가능하면 세션 JWT 를 새 store_id 로 재발급.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';
import { listAccessibleStores } from '@/lib/auth/accessible-stores';

interface SwitchBody {
  store_id: string;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SwitchBody;
    const targetId = (body.store_id ?? '').trim();
    if (!targetId) {
      return NextResponse.json({ data: null, error: 'store_id 필요' }, { status: 400 });
    }

    const db = getDB();
    const allowed = await listAccessibleStores(db, session.staff_user_id, session.role_code);
    const target = allowed.find((s) => s.id === targetId);
    if (!target) {
      return NextResponse.json(
        { data: null, error: '해당 매장에 접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const token = await signSession({
      staff_user_id: session.staff_user_id,
      store_id: target.id,
      store_code: target.store_code,
      display_name: session.display_name,
      role_code: session.role_code,
      permissions: session.permissions,
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({
      data: { store_id: target.id, store_code: target.store_code, store_name: target.name },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
