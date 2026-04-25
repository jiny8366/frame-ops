// Frame Ops Web — /api/auth/login (POST)
// 입력: { store_code, password }
// 처리: 매장 코드 → store_id, 해당 매장 활성 직원 password_hash 비교, 매칭 직원 1명일 때만 세션 발급.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDB } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/password';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/auth/permissions';

interface LoginBody {
  store_code: string;
  password: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const storeCode = (body.store_code ?? '').trim();
    const password = body.password ?? '';

    if (!storeCode || !password) {
      return NextResponse.json(
        { data: null, error: '지점 코드와 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const db = getDB();

    // 1. 매장 조회
    const { data: store, error: storeErr } = await db
      .from('fo_stores')
      .select('id, store_code, name, active')
      .eq('store_code', storeCode)
      .eq('active', true)
      .maybeSingle();

    if (storeErr) {
      return NextResponse.json({ data: null, error: storeErr.message }, { status: 500 });
    }
    if (!store) {
      return NextResponse.json(
        { data: null, error: '존재하지 않거나 비활성 매장입니다.' },
        { status: 401 }
      );
    }

    // 2. 매장 소속 활성 직원 조회 (password_hash 보유 한정)
    const { data: scopes, error: scopeErr } = await db
      .from('fo_staff_store_scopes')
      .select('user_id')
      .eq('store_id', store.id);

    if (scopeErr) {
      return NextResponse.json({ data: null, error: scopeErr.message }, { status: 500 });
    }
    const scopedIds = (scopes ?? []).map((r) => r.user_id);
    if (scopedIds.length === 0) {
      return NextResponse.json(
        { data: null, error: '해당 매장에 등록된 직원이 없습니다.' },
        { status: 401 }
      );
    }

    const { data: staffRows, error: staffErr } = await db
      .from('fo_staff_profiles')
      .select('user_id, display_name, role_code, password_hash, permissions, active')
      .in('user_id', scopedIds)
      .eq('active', true);

    if (staffErr) {
      return NextResponse.json({ data: null, error: staffErr.message }, { status: 500 });
    }

    // 3. password 일치 직원 찾기
    const matches: Array<{
      user_id: string;
      display_name: string | null;
      role_code: string;
      permissions: string[] | null;
    }> = [];
    for (const s of staffRows ?? []) {
      if (!s.password_hash) continue;
      const ok = await verifyPassword(password, s.password_hash);
      if (ok) {
        matches.push({
          user_id: s.user_id,
          display_name: s.display_name,
          role_code: s.role_code,
          permissions: s.permissions,
        });
      }
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { data: null, error: '아이디 또는 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }
    if (matches.length > 1) {
      console.error(
        `[auth/login] 패스워드 충돌: store=${storeCode}, count=${matches.length}. 관리자에게 문의 필요.`
      );
      return NextResponse.json(
        {
          data: null,
          error: '동일한 비밀번호의 직원이 여러 명입니다. 관리자에게 비밀번호 변경을 요청하세요.',
        },
        { status: 409 }
      );
    }

    const staff = matches[0];
    const permissions = effectivePermissions(staff.role_code, staff.permissions);

    // 4. 세션 발급 + 쿠키 설정
    const token = await signSession({
      staff_user_id: staff.user_id,
      store_id: store.id,
      store_code: store.store_code,
      display_name: staff.display_name ?? '',
      role_code: staff.role_code,
      permissions,
    });

    const cookieStore = await cookies();
    cookieStore.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      // jose 가 12h 만료를 토큰에 박았지만 쿠키도 동일 만료로 정렬
      maxAge: 60 * 60 * 12,
    });

    return NextResponse.json({
      data: {
        store_id: store.id,
        store_code: store.store_code,
        store_name: store.name,
        staff_user_id: staff.user_id,
        display_name: staff.display_name,
        role_code: staff.role_code,
        permissions,
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
