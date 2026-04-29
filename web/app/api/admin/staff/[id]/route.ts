// Frame Ops Web — /api/admin/staff/[id]
// PATCH: 직원 정보·비밀번호·활성 상태 업데이트.
// 권한:
//   - 본사(hq_*) — 매장 스코프 검증만, 모든 필드 자유롭게 수정.
//   - 지점 매니저(store_manager) — 본인 매장 소속 + 판매사/직원 한정으로 수정.
//   - 그 외 — 거부.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';
import type { Database } from '@/types/database';

type StaffUpdate = Database['public']['Tables']['fo_staff_profiles']['Update'];

const STORE_MANAGEABLE_ROLES = ['store_salesperson', 'store_staff'] as const;

interface PatchBody {
  display_name?: string;
  role_code?: string;
  job_title_code?: string | null;
  phone?: string | null;
  active?: boolean;
  password?: string;
  /** 명시 권한. null/빈배열 → role 기본값 사용. 미전송 → 변경 안 함 */
  permissions?: string[] | null;
  /** 지점 역할의 근무지 매장. 변경 시 fo_staff_store_scopes 교체. */
  store_id?: string | null;
}

async function ensureScoped(userId: string, storeId: string): Promise<boolean> {
  const db = getDB();
  const { data } = await db
    .from('fo_staff_store_scopes')
    .select('user_id')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .maybeSingle();
  return !!data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const callerIsHq = session.role_code.startsWith('hq_');
  const callerIsManager = session.role_code === 'store_manager';
  if (!callerIsHq && !callerIsManager) {
    return NextResponse.json(
      { data: null, error: '계정 수정 권한이 없습니다 (지점 매니저 이상 필요).' },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!(await ensureScoped(id, session.store_id))) {
    return NextResponse.json(
      { data: null, error: '해당 매장 소속 직원이 아닙니다.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as PatchBody;
    const db = getDB();

    // /admin/staff 는 매장 계정 전용. 대상 행이 판매사/직원이 아니면 거부 (HQ·매니저 공통).
    const { data: current } = await db
      .from('fo_staff_profiles')
      .select('role_code')
      .eq('user_id', id)
      .maybeSingle();
    const currentRole = current?.role_code ?? '';
    if (
      !STORE_MANAGEABLE_ROLES.includes(
        currentRole as (typeof STORE_MANAGEABLE_ROLES)[number]
      )
    ) {
      return NextResponse.json(
        {
          data: null,
          error: '매장 계정 화면에서는 판매사/직원 계정만 수정할 수 있습니다.',
        },
        { status: 403 }
      );
    }
    if (
      body.role_code !== undefined &&
      !STORE_MANAGEABLE_ROLES.includes(
        body.role_code as (typeof STORE_MANAGEABLE_ROLES)[number]
      )
    ) {
      return NextResponse.json(
        {
          data: null,
          error: '매장 계정은 판매사/직원 외 역할로 변경할 수 없습니다.',
        },
        { status: 403 }
      );
    }

    // 지점 매니저는 본인 매장 외부로 이전 불가.
    if (callerIsManager) {
      if (body.store_id !== undefined && body.store_id !== session.store_id) {
        return NextResponse.json(
          { data: null, error: '지점 매니저는 근무지를 변경할 수 없습니다.' },
          { status: 403 }
        );
      }
    }

    const update: StaffUpdate = {};
    if (body.display_name !== undefined) update.display_name = body.display_name.trim();
    if (body.role_code !== undefined) update.role_code = body.role_code;
    if (body.job_title_code !== undefined) update.job_title_code = body.job_title_code;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.active !== undefined) update.active = body.active;
    if (body.permissions !== undefined) {
      // 빈배열·null → role 기본값 사용 (NULL 저장)
      update.permissions =
        Array.isArray(body.permissions) && body.permissions.length > 0
          ? body.permissions
          : null;
    }

    const isStoreRole = body.role_code?.startsWith('store_') ?? true;

    // 비밀번호 변경: 지점 계정이면 매장 내 평문 중복 검사 후 password_plain 도 갱신.
    if (body.password) {
      if (isStoreRole) {
        // 같은 매장 내 다른 활성 지점 계정과 평문 중복인지 검사 (지점 단위 유일성).
        const { data: scoped } = await db
          .from('fo_staff_store_scopes')
          .select('user_id')
          .eq('store_id', session.store_id);
        const scopedIds = (scoped ?? []).map((r) => r.user_id).filter((uid) => uid !== id);
        if (scopedIds.length > 0) {
          const { data: dup } = await db
            .from('fo_staff_profiles')
            .select('user_id')
            .eq('password_plain', body.password)
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
      update.password_hash = await hashPassword(body.password);
      update.password_updated_at = new Date().toISOString();
      update.password_plain = isStoreRole ? body.password : null;
    } else if (body.role_code !== undefined && !isStoreRole) {
      // 본사 역할로 전환 — 평문 비밀번호 보관하지 않음.
      update.password_plain = null;
    }

    if (Object.keys(update).length > 0) {
      const { error: updErr } = await db
        .from('fo_staff_profiles')
        .update(update)
        .eq('user_id', id);
      if (updErr) {
        return NextResponse.json({ data: null, error: updErr.message }, { status: 500 });
      }
    }

    // 근무지 매장: 지점 역할이고 store_id 가 명시된 경우 스코프 교체. (HQ 만 도달; 매니저는 위에서 차단)
    if (body.store_id !== undefined && body.store_id !== null && isStoreRole) {
      await db.from('fo_staff_store_scopes').delete().eq('user_id', id);
      const { error: scopeErr } = await db
        .from('fo_staff_store_scopes')
        .insert({ user_id: id, store_id: body.store_id });
      if (scopeErr) {
        return NextResponse.json({ data: null, error: scopeErr.message }, { status: 500 });
      }
    }

    const { data, error } = await db
      .from('fo_staff_profiles')
      .select('user_id, login_id, display_name, role_code, job_title_code, phone, active')
      .eq('user_id', id)
      .single();
    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
