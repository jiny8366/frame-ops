// Frame Ops Web — /api/admin/staff
// GET: 현재 매장 직원 리스트
// POST: 신규 직원 생성 (login_id, display_name, role_code, password) + 매장 스코프 자동 연결
//
// 권한 모델:
//   - 본사(hq_*) — 모든 역할 생성 가능, store_id 명시.
//   - 지점 매니저(store_manager) — 본인 매장에서 store_salesperson / store_staff 만 생성.
//     role/store_id 는 서버에서 강제 (클라이언트가 위조해도 무시).
//   - 그 외 역할 — 거부 (계정 관리는 매니저 이상의 책임).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';

const STORE_MANAGEABLE_ROLES = ['store_salesperson', 'store_staff'] as const;

interface CreateStaffBody {
  /** 본사 역할에서만 의미 있음. 지점 역할은 서버가 매장 store_code 로 강제 정정. */
  login_id?: string;
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
      'user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions, password_plain, password_updated_at, created_at'
    )
    .in('user_id', ids)
    .order('active', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 본사 관리자만 지점 계정 평문 비밀번호 응답에 포함.
  const callerIsHq = session.role_code.startsWith('hq_');
  const enriched = (data ?? []).map((row) => {
    const out = { ...row, store_id: session.store_id } as Record<string, unknown> & {
      role_code?: string;
      password_plain?: string | null;
    };
    const isStoreRow =
      typeof out.role_code === 'string' && out.role_code.startsWith('store_');
    if (!callerIsHq || !isStoreRow) {
      delete out.password_plain;
    }
    return out;
  });
  return NextResponse.json({ data: enriched, error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const callerIsHq = session.role_code.startsWith('hq_');
  const callerIsManager = session.role_code === 'store_manager';
  if (!callerIsHq && !callerIsManager) {
    return NextResponse.json(
      { data: null, error: '계정 추가 권한이 없습니다 (지점 매니저 이상 필요).' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as CreateStaffBody;
    const displayName = (body.display_name ?? '').trim();
    const password = body.password ?? '';
    const roleCode = body.role_code ?? '';

    if (!displayName || !roleCode || !password) {
      return NextResponse.json(
        { data: null, error: 'display_name, role_code, password 모두 필수입니다.' },
        { status: 400 }
      );
    }

    // 지점 매니저는 본인 매장의 판매사/직원만 생성 가능. role/store 강제 정정.
    let targetStoreId: string;
    if (callerIsManager) {
      if (!STORE_MANAGEABLE_ROLES.includes(roleCode as (typeof STORE_MANAGEABLE_ROLES)[number])) {
        return NextResponse.json(
          { data: null, error: '지점 매니저는 판매사/직원 계정만 생성할 수 있습니다.' },
          { status: 403 }
        );
      }
      targetStoreId = session.store_id;
    } else {
      // HQ — store_id 가 명시되면 그것, 아니면 본인 매장 (본사 사용자에게도 기본 매장이 있음).
      targetStoreId = body.store_id || session.store_id;
    }

    const db = getDB();
    const isStoreRole = roleCode.startsWith('store_');

    // login_id 결정:
    //   - 지점 역할 → 매장 store_code 로 강제 (매장의 모든 직원이 동일 login_id 공유, 비밀번호로 구별)
    //   - 본사 역할 → 본문 login_id 사용 + hq 범위 내 중복 검사
    let loginId: string;
    if (isStoreRole) {
      const { data: storeRow } = await db
        .from('fo_stores')
        .select('store_code')
        .eq('id', targetStoreId)
        .maybeSingle();
      if (!storeRow?.store_code) {
        return NextResponse.json(
          { data: null, error: '근무지 매장을 찾을 수 없습니다.' },
          { status: 400 }
        );
      }
      loginId = storeRow.store_code;
    } else {
      loginId = (body.login_id ?? '').trim();
      if (!loginId) {
        return NextResponse.json(
          { data: null, error: '본사 계정은 login_id 가 필요합니다.' },
          { status: 400 }
        );
      }
      // 본사 계정 login_id 중복 검사 (hq 범위 내)
      const { data: existing } = await db
        .from('fo_staff_profiles')
        .select('user_id')
        .eq('login_id', loginId)
        .like('role_code', 'hq_%')
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { data: null, error: '이미 사용 중인 로그인 아이디입니다.' },
          { status: 409 }
        );
      }
    }

    // 지점 계정 비밀번호 중복 체크 — 같은 매장 내에서만 검사 (지점 단위 유일성).
    if (isStoreRole) {
      const { data: scoped } = await db
        .from('fo_staff_store_scopes')
        .select('user_id')
        .eq('store_id', targetStoreId);
      const scopedIds = (scoped ?? []).map((r) => r.user_id);
      if (scopedIds.length > 0) {
        const { data: dup } = await db
          .from('fo_staff_profiles')
          .select('user_id, login_id')
          .eq('password_plain', password)
          .like('role_code', 'store_%')
          .eq('active', true)
          .in('user_id', scopedIds)
          .maybeSingle();
        if (dup) {
          return NextResponse.json(
            { data: null, error: '이 매장에 이미 사용 중인 비밀번호입니다. 다른 비밀번호를 사용해 주세요.' },
            { status: 409 }
          );
        }
      }
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
        password_plain: isStoreRole ? password : null,
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
