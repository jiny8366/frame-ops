// Frame Ops Web — /api/admin/staff
// GET: 현재 매장 직원 리스트
// POST: 신규 직원 생성 (login_id, display_name, role_code, password) + 매장 스코프 자동 연결

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';

interface CreateStaffBody {
  login_id: string;
  display_name: string;
  role_code: string;
  job_title_code?: string | null;
  phone?: string | null;
  password: string;
  /** 명시 권한 — null/빈배열이면 role 기본값 사용 */
  permissions?: string[] | null;
  /** 지점 역할의 근무지 매장. 미지정 시 현재 세션 매장 사용. */
  store_id?: string | null;
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const { data: scopes } = await db
    .from('fo_staff_store_scopes')
    .select('user_id')
    .eq('store_id', session.store_id);

  const ids = (scopes ?? []).map((r) => r.user_id);
  if (ids.length === 0) {
    return NextResponse.json({ data: [], error: null });
  }

  const { data, error } = await db
    .from('fo_staff_profiles')
    .select(
      'user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions, password_updated_at, created_at'
    )
    .in('user_id', ids)
    .order('active', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 현재 세션 매장 스코프 기준으로 조회된 행이므로 모두 같은 store_id.
  const enriched = (data ?? []).map((row) => ({ ...row, store_id: session.store_id }));
  return NextResponse.json({ data: enriched, error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateStaffBody;
    const loginId = (body.login_id ?? '').trim();
    const displayName = (body.display_name ?? '').trim();
    const password = body.password ?? '';
    const roleCode = body.role_code ?? '';

    if (!loginId || !displayName || !roleCode || !password) {
      return NextResponse.json(
        { data: null, error: 'login_id, display_name, role_code, password 모두 필수입니다.' },
        { status: 400 }
      );
    }

    const db = getDB();

    // login_id 중복 체크
    const { data: existing } = await db
      .from('fo_staff_profiles')
      .select('user_id')
      .eq('login_id', loginId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { data: null, error: '이미 사용 중인 로그인 아이디입니다.' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const explicitPerms =
      Array.isArray(body.permissions) && body.permissions.length > 0
        ? body.permissions
        : null;

    const { data: created, error: insErr } = await db
      .from('fo_staff_profiles')
      .insert({
        login_id: loginId,
        display_name: displayName,
        role_code: roleCode,
        job_title_code: body.job_title_code ?? null,
        phone: body.phone ?? null,
        password_hash: passwordHash,
        password_updated_at: new Date().toISOString(),
        permissions: explicitPerms,
        active: true,
      })
      .select('user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions')
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { data: null, error: insErr?.message ?? '직원 생성 실패' },
        { status: 500 }
      );
    }

    // 근무지 매장: 지점 역할이고 body 에 명시되면 그 매장, 아니면 현재 세션 매장.
    const isStoreRole = roleCode.startsWith('store_');
    const targetStoreId = isStoreRole && body.store_id ? body.store_id : session.store_id;

    const { error: scopeErr } = await db.from('fo_staff_store_scopes').insert({
      user_id: created.user_id,
      store_id: targetStoreId,
    });
    if (scopeErr) {
      // 롤백: 방금 만든 프로필 제거
      await db.from('fo_staff_profiles').delete().eq('user_id', created.user_id);
      return NextResponse.json({ data: null, error: scopeErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: created, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
