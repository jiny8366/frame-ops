// Frame Ops Web — /api/auth/verify-staff-password (POST)
// POS 결제 확정 시 담당자 패스워드 재인증.
// 현재 세션의 store 안에서 password 일치 직원을 찾아 staff_user_id 반환.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { verifyPassword } from '@/lib/auth/password';

interface VerifyBody {
  password: string;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const { password } = (await request.json()) as VerifyBody;
    if (!password) {
      return NextResponse.json(
        { data: null, error: '비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const db = getDB();

    const { data: scopes } = await db
      .from('fo_staff_store_scopes')
      .select('user_id')
      .eq('store_id', session.store_id);

    const ids = (scopes ?? []).map((r) => r.user_id);
    if (ids.length === 0) {
      return NextResponse.json(
        { data: null, error: '매장에 직원이 등록되지 않았습니다.' },
        { status: 401 }
      );
    }

    const { data: staffRows } = await db
      .from('fo_staff_profiles')
      .select('user_id, display_name, role_code, password_hash, active')
      .in('user_id', ids)
      .eq('active', true);

    const matches: Array<{ user_id: string; display_name: string | null; role_code: string }> = [];
    for (const s of staffRows ?? []) {
      if (!s.password_hash) continue;
      const ok = await verifyPassword(password, s.password_hash);
      if (ok) {
        matches.push({
          user_id: s.user_id,
          display_name: s.display_name,
          role_code: s.role_code,
        });
      }
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { data: null, error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }
    if (matches.length > 1) {
      return NextResponse.json(
        { data: null, error: '동일 비밀번호 직원이 여러 명입니다. 관리자에게 문의하세요.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: {
        staff_user_id: matches[0].user_id,
        display_name: matches[0].display_name,
        role_code: matches[0].role_code,
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
