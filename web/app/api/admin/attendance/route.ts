// Frame Ops Web — /api/admin/attendance
// GET ?store_id=&from=&to=
// HQ 사용자: 매장 필터(없으면 전체). 지점 사용자: 자기 매장만 강제.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { isHqRole } from '@/lib/auth/permissions';

interface AttendanceRow {
  id: string;
  user_id: string;
  store_id: string;
  event: string;
  occurred_at: string;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  display_name?: string | null;
  login_id?: string | null;
  store_name?: string | null;
  store_code?: string | null;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const queryStoreId = url.searchParams.get('store_id') || null;
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();

  // 지점 사용자는 자기 매장으로 강제
  const effectiveStoreId = isHqRole(session.role_code) ? queryStoreId : session.store_id;

  const db = getDB();
  let query = db
    .from('fo_attendance')
    .select('id, user_id, store_id, event, occurred_at, lat, lng, distance_m')
    .gte('occurred_at', `${from}T00:00:00Z`)
    .lte('occurred_at', `${to}T23:59:59Z`)
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (effectiveStoreId) query = query.eq('store_id', effectiveStoreId);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const events: AttendanceRow[] = rows ?? [];

  // 직원 + 매장 정보 조인 (별도 조회)
  if (events.length > 0) {
    const userIds = Array.from(new Set(events.map((r) => r.user_id)));
    const storeIds = Array.from(new Set(events.map((r) => r.store_id)));

    const [staffRes, storeRes] = await Promise.all([
      db
        .from('fo_staff_profiles')
        .select('user_id, login_id, display_name')
        .in('user_id', userIds),
      db
        .from('fo_stores')
        .select('id, store_code, name')
        .in('id', storeIds),
    ]);

    const staffMap = new Map(
      (staffRes.data ?? []).map((s) => [s.user_id, { login_id: s.login_id, display_name: s.display_name }])
    );
    const storeMap = new Map(
      (storeRes.data ?? []).map((s) => [s.id, { store_code: s.store_code, name: s.name }])
    );

    for (const e of events) {
      const st = staffMap.get(e.user_id);
      const sr = storeMap.get(e.store_id);
      e.display_name = st?.display_name;
      e.login_id = st?.login_id;
      e.store_name = sr?.name;
      e.store_code = sr?.store_code;
    }
  }

  // HQ 가 아니면 store 리스트 반환 안 함 (자기 매장만)
  let stores: Array<{ id: string; store_code: string; name: string }> = [];
  if (isHqRole(session.role_code)) {
    const { data: storeList } = await db
      .from('fo_stores')
      .select('id, store_code, name')
      .eq('active', true)
      .order('store_code', { ascending: true });
    stores = storeList ?? [];
  }

  return NextResponse.json({
    data: {
      from,
      to,
      store_id: effectiveStoreId,
      stores,
      is_hq: isHqRole(session.role_code),
      events,
    },
    error: null,
  });
}
