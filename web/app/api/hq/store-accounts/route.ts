// Frame Ops Web — /api/hq/store-accounts
// 본사용 매장 계정(판매사·일반) 통합 조회/생성. 매장 필터 옵션.
//
// 권한 모델:
//   - 본사(hq_*) + hq_store_accounts 권한 보유자만 호출 가능.
//   - 생성 가능 역할: store_salesperson / store_staff.
//   - 매니저(store_manager) 생성은 /api/hq/staff 에서 처리.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';
import { hasPermission } from '@/lib/auth/permissions';

const STORE_ACCOUNT_ROLES = ['store_salesperson', 'store_staff'] as const;

interface CreateStoreAccountBody {
  display_name: string;
  role_code: string;
  job_title_code?: string | null;
  phone?: string | null;
  password: string;
  permissions?: string[] | null;
  /** 근무지 매장 — 필수. 매장 store_code 가 login_id 로 사용됨. */
  store_id: string;
}

function ensureCallerAuthorized(session: Awaited<ReturnType<typeof getServerSession>>) {
  if (!session) return { ok: false, error: '로그인이 필요합니다.', status: 401 } as const;
  if (!session.role_code.startsWith('hq_'))
    return { ok: false, error: '본사 권한이 필요합니다.', status: 403 } as const;
  if (!hasPermission(session.permissions, 'hq_store_accounts'))
    return { ok: false, error: '매장 계정 관리 권한이 없습니다.', status: 403 } as const;
  return { ok: true } as const;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  const auth = ensureCallerAuthorized(session);
  if (!auth.ok) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const filterStoreId = url.searchParams.get('store_id') || null;

  const db = getDB();

  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name, active')
    .eq('active', true)
    .order('store_code', { ascending: true });

  let scopesQuery = db.from('fo_staff_store_scopes').select('user_id, store_id');
  if (filterStoreId) scopesQuery = scopesQuery.eq('store_id', filterStoreId);
  const { data: scopes } = await scopesQuery;
  const ids = Array.from(new Set((scopes ?? []).map((r) => r.user_id)));
  if (ids.length === 0) {
    return NextResponse.json({ data: { staff: [], stores: stores ?? [] }, error: null });
  }

  const { data: rows, error } = await db
    .from('fo_staff_profiles')
    .select(
      'user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions, password_plain, password_updated_at, created_at'
    )
    .in('user_id', ids)
    .in('role_code', STORE_ACCOUNT_ROLES as unknown as string[])
    .order('active', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

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
    return out;
  });

  return NextResponse.json({ data: { staff: enriched, stores: stores ?? [] }, error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  const auth = ensureCallerAuthorized(session);
  if (!auth.ok) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as CreateStoreAccountBody;
    const displayName = (body.display_name ?? '').trim();
    const password = body.password ?? '';
    const roleCode = body.role_code ?? '';
    const storeId = body.store_id ?? '';

    if (!displayName || !roleCode || !password || !storeId) {
      return NextResponse.json(
        {
          data: null,
          error: 'display_name, role_code, password, store_id 모두 필수입니다.',
        },
        { status: 400 }
      );
    }

    if (!STORE_ACCOUNT_ROLES.includes(roleCode as (typeof STORE_ACCOUNT_ROLES)[number])) {
      return NextResponse.json(
        { data: null, error: '매장 계정은 판매사/직원 역할만 생성할 수 있습니다.' },
        { status: 403 }
      );
    }

    const db = getDB();
    const { data: storeRow } = await db
      .from('fo_stores')
      .select('store_code')
      .eq('id', storeId)
      .maybeSingle();
    if (!storeRow?.store_code) {
      return NextResponse.json(
        { data: null, error: '근무지 매장을 찾을 수 없습니다.' },
        { status: 400 }
      );
    }
    const loginId = storeRow.store_code;

    // 매장 내 비밀번호 중복 검사 (지점 단위 유일성).
    const { data: scoped } = await db
      .from('fo_staff_store_scopes')
      .select('user_id')
      .eq('store_id', storeId);
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
          {
            data: null,
            error: '이 매장에 이미 사용 중인 비밀번호입니다. 다른 비밀번호를 사용해 주세요.',
          },
          { status: 409 }
        );
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
        password_plain: password,
        password_updated_at: new Date().toISOString(),
        permissions: explicitPerms,
        active: true,
      })
      .select(
        'user_id, login_id, display_name, role_code, job_title_code, phone, active, permissions'
      )
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { data: null, error: insErr?.message ?? '직원 생성 실패' },
        { status: 500 }
      );
    }

    const { error: scopeErr } = await db.from('fo_staff_store_scopes').insert({
      user_id: created.user_id,
      store_id: storeId,
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
