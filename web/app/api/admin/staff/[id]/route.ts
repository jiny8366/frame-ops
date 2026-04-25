// Frame Ops Web — /api/admin/staff/[id]
// PATCH: 직원 정보·비밀번호·활성 상태 업데이트.
// 권한: 현재 세션 매장에 속한 직원만 수정 가능.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';
import type { Database } from '@/types/database';

type StaffUpdate = Database['public']['Tables']['fo_staff_profiles']['Update'];

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

  const { id } = await params;
  if (!(await ensureScoped(id, session.store_id))) {
    return NextResponse.json(
      { data: null, error: '해당 매장 소속 직원이 아닙니다.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as PatchBody;
    const update: StaffUpdate = {};
    if (body.display_name !== undefined) update.display_name = body.display_name.trim();
    if (body.role_code !== undefined) update.role_code = body.role_code;
    if (body.job_title_code !== undefined) update.job_title_code = body.job_title_code;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.active !== undefined) update.active = body.active;
    if (body.password) {
      update.password_hash = await hashPassword(body.password);
      update.password_updated_at = new Date().toISOString();
    }
    if (body.permissions !== undefined) {
      // 빈배열·null → role 기본값 사용 (NULL 저장)
      update.permissions =
        Array.isArray(body.permissions) && body.permissions.length > 0
          ? body.permissions
          : null;
    }

    const db = getDB();

    if (Object.keys(update).length > 0) {
      const { error: updErr } = await db
        .from('fo_staff_profiles')
        .update(update)
        .eq('user_id', id);
      if (updErr) {
        return NextResponse.json({ data: null, error: updErr.message }, { status: 500 });
      }
    }

    // 근무지 매장: 지점 역할이고 store_id 가 명시된 경우 스코프 교체.
    const isStoreRole = body.role_code?.startsWith('store_') ?? false;
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
