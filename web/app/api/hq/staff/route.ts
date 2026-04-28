// Frame Ops Web — /api/hq/staff
// 본사용 직원 통합 조회/생성. 매장 필터 옵션.
//
// 권한 모델:
//   - 본사(hq_*) 만 호출 가능.
//   - 생성 가능 역할: 본사 역할(hq_*) + 지점 매니저(store_manager) 까지.
//     판매사/직원(store_salesperson, store_staff)은 지점 매니저가 /api/admin/staff 로 등록.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';

const HQ_CREATABLE_ROLES = [
  'hq_super',
  'hq_purchase',
  'hq_view',
  'store_manager',
] as const;

/** /hq/staff 페이지 노출 대상 — 본사 역할 + 지점 매니저까지. 판매사/직원은 /hq/store-accounts 에서 별도 관리. */
const HQ_VISIBLE_ROLES = HQ_CREATABLE_ROLES;

interface CreateStaffBody {
  /** 본사 역할에서만 의미 있음. 지점 역할(매니저)은 서버가 매장 store_code 로 강제. */
  login_id?: string;
  display_name: string;
  role_code: string;
  job_title_code?: string | null;
  phone?: string | null;
  password: string;
  permissions?: string[] | null;
  store_id?: string | null;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!session.role_code.startsWith('hq_')) {
    return NextResponse.json({ data: null, error: '본사 권한이 필요합니다.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const filterStoreId = url.searchParams.get('store_id') || null;

  const db = getDB();

  // 1) 매장 옵션
  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name, active')
    .eq('active', true)
    .order('store_code', { ascending: true });

  // 2) 스코프 매핑 (user_id ↔ store_id)
  let scopesQuery = db.from('fo_staff_store_scopes').select('user_id, store_id');
  if (filterStoreId) scopesQuery = scopesQuery.eq('store_id', filterStoreId);
  const { data: scopes } = await scopesQuery;
  const ids = Array.from(new Set((scopes ?? []).map((r) => r.user_id)));
  if (ids.length === 0) {
    return NextResponse.json({ data: { staff: [], stores: stores ?? [] }, error: null });
  }

  // 3) 본사 관리자만 password_plain 조회 가능 (지점 계정 한정)
  //    /hq/staff 는 본사 역할 + 지점 매니저만 노출. 판매사/직원은 /hq/store-accounts 에서 관리.
  const { data: rows, error } = await db
    .from('fo_staff_profiles')
    .select(
      'user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions, password_plain, password_updated_at, created_at'
    )
    .in('user_id', ids)
    .in('role_code', HQ_VISIBLE_ROLES as unknown as string[])
    .order('active', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 4) 각 행에 store 정보 매핑 (첫 스코프 기준)
  const scopeByUser = new Map<string, string>();
  for (const r of scopes ?? []) {
    if (!scopeByUser.has(r.user_id)) scopeByUser.set(r.user_id, r.store_id);
  }
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));

  const enriched = (rows ?? []).map((row) => {
    const out: Record<string, unknown> = { ...row };
    const sid = scopeByUser.get(row.user_id) ?? null;
    out.store_id = sid;
    if (sid) {
      const st = storeById.get(sid);
      out.store_code = st?.store_code ?? null;
      out.store_name = st?.name ?? null;
    } else {
      out.store_code = null;
      out.store_name = null;
    }
    // 비-지점 계정은 password_plain 노출 안 함
    if (typeof row.role_code === 'string' && !row.role_code.startsWith('store_')) {
      delete out.password_plain;
    }
    return out;
  });

  return NextResponse.json({ data: { staff: enriched, stores: stores ?? [] }, error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!session.role_code.startsWith('hq_')) {
    return NextResponse.json({ data: null, error: '본사 권한이 필요합니다.' }, { status: 403 });
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

    if (!HQ_CREATABLE_ROLES.includes(roleCode as (typeof HQ_CREATABLE_ROLES)[number])) {
      return NextResponse.json(
        {
          data: null,
          error: '본사에서는 본사 역할 또는 지점 매니저만 생성할 수 있습니다. 판매사/직원은 지점에서 등록하세요.',
        },
        { status: 403 }
      );
    }

    const db = getDB();
    const isStoreRole = roleCode.startsWith('store_');

    if (isStoreRole && !body.store_id) {
      return NextResponse.json(
        { data: null, error: '지점 역할은 근무지(store_id) 가 필요합니다.' },
        { status: 400 }
      );
    }

    // login_id 결정 — 지점 역할이면 매장 store_code 강제, 본사 역할이면 본문 + hq 범위 중복 검사
    let loginId: string;
    if (isStoreRole) {
      const { data: storeRow } = await db
        .from('fo_stores')
        .select('store_code')
        .eq('id', body.store_id!)
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

    // 지점 매니저 비밀번호 중복 체크 — 같은 매장 내 활성 지점 계정만 검사 (지점 단위 유일성).
    if (isStoreRole) {
      const { data: scoped } = await db
        .from('fo_staff_store_scopes')
        .select('user_id')
        .eq('store_id', body.store_id!);
      const scopedIds = (scoped ?? []).map((r) => r.user_id);
      if (scopedIds.length > 0) {
        const { data: dup } = await db
          .from('fo_staff_profiles')
          .select('user_id')
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

    // 매장 스코프 — 지점이면 명시 store_id, 본사 역할이면 본사 사용자가 속한 스토어(없으면 첫 활성 스토어)
    let targetStoreId = body.store_id ?? null;
    if (!targetStoreId) {
      targetStoreId = session.store_id;
    }

    const { error: scopeErr } = await db.from('fo_staff_store_scopes').insert({
      user_id: created.user_id,
      store_id: targetStoreId,
    });
    if (scopeErr) {
      await db.from('fo_staff_profiles').delete().eq('user_id', created.user_id);
      return NextResponse.json({ data: null, error: scopeErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: created, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
