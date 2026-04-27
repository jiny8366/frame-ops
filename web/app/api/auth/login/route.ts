// Frame Ops Web — /api/auth/login (POST)
// 두 가지 로그인 모드 지원:
//   1) 본사 로그인: identifier = login_id (예: hq_admin), 사용자 password
//      → role_code 가 hq_* 인 직원만 매칭 → /hq 진입
//   2) 지점 로그인: identifier = store_code (예: BKC01), 직원 password
//      → 해당 매장 활성 직원 중 password 일치자 → /pos 진입

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDB } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/password';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';
import { effectivePermissions, isHqRole } from '@/lib/auth/permissions';
import { listAccessibleStores } from '@/lib/auth/accessible-stores';
import { haversineMeters } from '@/lib/geo';

interface LoginBody {
  /** 지점 코드 또는 본사 사용자 login_id */
  store_code: string;
  password: string;
  /** 모바일 여부 — 클라이언트가 User-Agent 검사로 결정 */
  is_mobile?: boolean;
  /** 위치 좌표 — 모바일에서만 전달 */
  geo?: { lat: number; lng: number };
  /** 위치 권한 거부 여부 — 모바일에서만 의미 있음 */
  geo_denied?: boolean;
}

interface SessionData {
  store_id: string;
  store_code: string;
  store_name: string | null;
  staff_user_id: string;
  display_name: string | null;
  role_code: string;
  permissions: string[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const identifier = (body.store_code ?? '').trim();
    const password = body.password ?? '';

    if (!identifier || !password) {
      return NextResponse.json(
        { data: null, error: '아이디와 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const db = getDB();

    // ── 1) 본사 로그인 시도 (login_id 일치 + role hq_*) ────────────────────────
    const hqResult = await tryHqLogin(db, identifier, password);
    if (hqResult.kind === 'success') {
      const stores = await listAccessibleStores(
        db,
        hqResult.data.staff_user_id,
        hqResult.data.role_code
      );
      return await issueSession(hqResult.data, stores);
    } else if (hqResult.kind === 'error') {
      return NextResponse.json(
        { data: null, error: hqResult.error },
        { status: hqResult.status }
      );
    }
    // hqResult.kind === 'not_found' → 지점 로그인 시도로 넘어감

    // ── 2) 지점 로그인 시도 (store_code + 매장 직원 password + 모바일 geo 검증) ─
    const userAgent = request.headers.get('user-agent') ?? '';
    const storeResult = await tryStoreLogin(db, identifier, password, {
      isMobile: !!body.is_mobile,
      geo: body.geo,
      geoDenied: !!body.geo_denied,
      userAgent,
    });
    if (storeResult.kind === 'success') {
      // 지점 사용자는 보통 단일 매장. accessible_stores 는 현재 매장만 반환.
      return await issueSession(storeResult.data, [
        {
          id: storeResult.data.store_id,
          store_code: storeResult.data.store_code,
          name: storeResult.data.store_name ?? '',
        },
      ]);
    }
    if (storeResult.kind === 'error') {
      return NextResponse.json(
        { data: null, error: storeResult.error },
        { status: storeResult.status }
      );
    }
    return NextResponse.json(
      { data: null, error: '아이디 또는 비밀번호가 일치하지 않습니다.' },
      { status: 401 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

// ── 본사 로그인 ──────────────────────────────────────────────────────────────
type DB = ReturnType<typeof getDB>;
type LoginAttempt =
  | { kind: 'success'; data: SessionData }
  | { kind: 'error'; error: string; status: number }
  | { kind: 'not_found' };

async function tryHqLogin(db: DB, identifier: string, password: string): Promise<LoginAttempt> {
  // 지점 계정도 login_id 를 store_code 로 공유하므로 같은 identifier 로 여러 행이 매칭될 수
  // 있음. HQ 로그인 조회는 role_code = hq_% 로 좁혀 정확히 0/1 행으로 한정.
  const { data: staff, error } = await db
    .from('fo_staff_profiles')
    .select('user_id, login_id, display_name, role_code, password_hash, permissions, active')
    .eq('login_id', identifier)
    .eq('active', true)
    .like('role_code', 'hq_%')
    .maybeSingle();

  if (error) return { kind: 'error', error: error.message, status: 500 };
  if (!staff) return { kind: 'not_found' };
  if (!isHqRole(staff.role_code)) return { kind: 'not_found' }; // 방어적 — partial unique 가 보장

  if (!staff.password_hash) {
    return { kind: 'error', error: '본사 계정에 비밀번호가 설정되지 않았습니다.', status: 401 };
  }
  const ok = await verifyPassword(password, staff.password_hash);
  if (!ok) {
    return { kind: 'error', error: '비밀번호가 일치하지 않습니다.', status: 401 };
  }

  // 본사 사용자의 primary 매장 — 첫 번째 스코프 매장 (없으면 빈 값)
  const { data: scope } = await db
    .from('fo_staff_store_scopes')
    .select('store_id')
    .eq('user_id', staff.user_id)
    .limit(1)
    .maybeSingle();

  let storeRow: { id: string; store_code: string; name: string } | null = null;
  if (scope?.store_id) {
    const { data: s } = await db
      .from('fo_stores')
      .select('id, store_code, name')
      .eq('id', scope.store_id)
      .maybeSingle();
    storeRow = s;
  }

  const permissions = effectivePermissions(staff.role_code, staff.permissions);
  return {
    kind: 'success',
    data: {
      store_id: storeRow?.id ?? '',
      store_code: storeRow?.store_code ?? 'HQ',
      store_name: storeRow?.name ?? '본사',
      staff_user_id: staff.user_id,
      display_name: staff.display_name,
      role_code: staff.role_code,
      permissions,
    },
  };
}

// ── 지점 로그인 ──────────────────────────────────────────────────────────────
interface GeoCtx {
  isMobile: boolean;
  geo?: { lat: number; lng: number };
  geoDenied: boolean;
  userAgent: string;
}

async function tryStoreLogin(
  db: DB,
  identifier: string,
  password: string,
  ctx: GeoCtx
): Promise<LoginAttempt> {
  const { data: store, error: storeErr } = await db
    .from('fo_stores')
    .select('id, store_code, name, active, lat, lng, geo_radius_m, geo_required')
    .eq('store_code', identifier)
    .eq('active', true)
    .maybeSingle();

  if (storeErr) return { kind: 'error', error: storeErr.message, status: 500 };
  if (!store) {
    return {
      kind: 'error',
      error: '존재하지 않는 아이디 또는 비활성 매장입니다.',
      status: 401,
    };
  }

  const { data: scopes } = await db
    .from('fo_staff_store_scopes')
    .select('user_id')
    .eq('store_id', store.id);
  const scopedIds = (scopes ?? []).map((r) => r.user_id);
  if (scopedIds.length === 0) {
    return { kind: 'error', error: '해당 매장에 등록된 직원이 없습니다.', status: 401 };
  }

  const { data: staffRows } = await db
    .from('fo_staff_profiles')
    .select('user_id, display_name, role_code, password_hash, permissions, active')
    .in('user_id', scopedIds)
    .eq('active', true);

  const matches: Array<{
    user_id: string;
    display_name: string | null;
    role_code: string;
    permissions: string[] | null;
  }> = [];
  for (const s of staffRows ?? []) {
    if (!s.password_hash) continue;
    if (isHqRole(s.role_code)) continue; // 본사 계정은 지점 로그인 모드에서 제외 (login_id 로만)
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
    return {
      kind: 'error',
      error: '아이디 또는 비밀번호가 일치하지 않습니다.',
      status: 401,
    };
  }
  if (matches.length > 1) {
    console.error(
      `[auth/login] 패스워드 충돌: store=${identifier}, count=${matches.length}.`
    );
    return {
      kind: 'error',
      error: '동일한 비밀번호의 직원이 여러 명입니다. 관리자에게 비밀번호 변경을 요청하세요.',
      status: 409,
    };
  }

  const staff = matches[0];
  const permissions = effectivePermissions(staff.role_code, staff.permissions);

  // ── 모바일 + 매장 geo 활성 → 위치 검증 + 출근 기록 ─────────────────────
  const geoActive =
    ctx.isMobile && store.geo_required && store.lat != null && store.lng != null;
  let distance_m: number | null = null;

  if (geoActive) {
    if (ctx.geoDenied) {
      return {
        kind: 'error',
        error: '출근 기록을 위해 위치 권한이 필요합니다. 브라우저에서 위치를 허용해주세요.',
        status: 403,
      };
    }
    if (!ctx.geo) {
      return {
        kind: 'error',
        error: '위치 정보를 받아오지 못했습니다. 다시 시도해주세요.',
        status: 403,
      };
    }
    const dist = haversineMeters(store.lat!, store.lng!, ctx.geo.lat, ctx.geo.lng);
    const radius = store.geo_radius_m ?? 200;
    distance_m = Math.round(dist);
    if (dist > radius) {
      return {
        kind: 'error',
        error: `매장에서 ${distance_m}m 떨어져 있어 로그인할 수 없습니다 (허용 반경 ${radius}m).`,
        status: 403,
      };
    }
    // 출근 기록 (best-effort: 실패해도 로그인은 진행)
    await db.from('fo_attendance').insert({
      user_id: staff.user_id,
      store_id: store.id,
      event: 'clock_in',
      lat: ctx.geo.lat,
      lng: ctx.geo.lng,
      distance_m,
      user_agent: ctx.userAgent.slice(0, 300),
    });
  }

  return {
    kind: 'success',
    data: {
      store_id: store.id,
      store_code: store.store_code,
      store_name: store.name,
      staff_user_id: staff.user_id,
      display_name: staff.display_name,
      role_code: staff.role_code,
      permissions,
    },
  };
}

// ── 세션 발급 ────────────────────────────────────────────────────────────────
async function issueSession(
  data: SessionData,
  accessibleStores: { id: string; store_code: string; name: string }[]
): Promise<NextResponse> {
  const token = await signSession({
    staff_user_id: data.staff_user_id,
    store_id: data.store_id,
    store_code: data.store_code,
    display_name: data.display_name ?? '',
    role_code: data.role_code,
    permissions: data.permissions,
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
    data: { ...data, accessible_stores: accessibleStores },
    error: null,
  });
}
