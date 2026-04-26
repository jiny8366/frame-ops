// Frame Ops Web — /api/hq/staff/[id]
// 본사용 단일 직원 PATCH (스코프 검증 없이 모든 매장 직원 편집 가능).

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
  permissions?: string[] | null;
  store_id?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!session.role_code.startsWith('hq_')) {
    return NextResponse.json({ data: null, error: '본사 권한이 필요합니다.' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as PatchBody;
    const update: StaffUpdate = {};
    if (body.display_name !== undefined) update.display_name = body.display_name.trim();
    if (body.role_code !== undefined) update.role_code = body.role_code;
    if (body.job_title_code !== undefined) update.job_title_code = body.job_title_code;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.active !== undefined) update.active = body.active;
    if (body.permissions !== undefined) {
      update.permissions =
        Array.isArray(body.permissions) && body.permissions.length > 0
          ? body.permissions
          : null;
    }

    const db = getDB();
    const isStoreRole = body.role_code?.startsWith('store_') ?? false;

    if (body.password) {
      if (isStoreRole) {
        const { data: dup } = await db
          .from('fo_staff_profiles')
          .select('user_id')
          .eq('password_plain', body.password)
          .like('role_code', 'store_%')
          .eq('active', true)
          .neq('user_id', id)
          .maybeSingle();
        if (dup) {
          return NextResponse.json(
            { data: null, error: '이미 사용 중인 비밀번호입니다. 다른 비밀번호를 사용해 주세요.' },
            { status: 409 }
          );
        }
      }
      update.password_hash = await hashPassword(body.password);
      update.password_updated_at = new Date().toISOString();
      update.password_plain = isStoreRole ? body.password : null;
    } else if (body.role_code !== undefined && !isStoreRole) {
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
