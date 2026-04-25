// Frame Ops Web — /api/auth/logout (POST)
// 세션 쿠키 제거. store_* 사용자는 퇴근 기록(clock_out) 자동 추가.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { getServerSession } from '@/lib/auth/server-session';
import { getDB } from '@/lib/supabase/server';
import { isHqRole } from '@/lib/auth/permissions';

export async function POST(request: Request) {
  const session = await getServerSession();

  // 지점 직원은 퇴근 기록 (HQ 사용자 제외)
  if (session && session.store_id && !isHqRole(session.role_code)) {
    try {
      const db = getDB();
      await db.from('fo_attendance').insert({
        user_id: session.staff_user_id,
        store_id: session.store_id,
        event: 'clock_out',
        user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
      });
    } catch (e) {
      // 실패해도 로그아웃은 진행 (best-effort)
      console.error('[auth/logout] clock_out 기록 실패:', e);
    }
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return NextResponse.json({ data: { ok: true }, error: null });
}
