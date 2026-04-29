// Frame Ops Web — /api/hq/store-accounts/[id]
// 본사용 매장 계정(판매사·일반) 단일 PATCH.
// 권한: hq_* + hq_store_accounts. 대상 행은 store_salesperson / store_staff 만 허용.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hashPassword } from '@/lib/auth/password';
import { hasPermission } from '@/lib/auth/permissions';
import type { Database } from '@/types/database';

type StaffUpdate = Database['public']['Tables']['fo_staff_profiles']['Update'];

const STORE_ACCOUNT_ROLES = ['store_salesperson', 'store_staff'] as const;

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
  if (!hasPermission(session.permissions, 'hq_store_accounts')) {
    return NextResponse.json(
      { data: null, error: '매장 계정 관리 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const { id } = await params;
  try {
    const body = (await request.json()) as PatchBody;
    const db = getDB();

    // 대상 행이 매장 계정인지 확인 (다른 역할 행은 이 엔드포인트에서 거부)
    const { data: current } = await db
      .from('fo_staff_profiles')
      .select('role_code')
      .eq('user_id', id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json(
        { data: null, error: '대상 직원을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    if (
      !STORE_ACCOUNT_ROLES.includes(
        current.role_code as (typeof STORE_ACCOUNT_ROLES)[number]
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
      !STORE_ACCOUNT_ROLES.includes(
        body.role_code as (typeof STORE_ACCOUNT_ROLES)[number]
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

    // 비밀번호 변경 — 매장 단위(현재 또는 신규 store_id) 평문 중복 검사.
    if (body.password) {
      // 검사 대상 매장 — 변경 요청이 있으면 새 매장, 없으면 현재 스코프 매장.
      let targetStoreId: string | null = body.store_id ?? null;
      if (!targetStoreId) {
        const { data: scope } = await db
          .from('fo_staff_store_scopes')
          .select('store_id')
          .eq('user_id', id)
          .limit(1)
          .maybeSingle();
        targetStoreId = scope?.store_id ?? null;
      }
      if (targetStoreId) {
        const { data: scoped } = await db
          .from('fo_staff_store_scopes')
          .select('user_id')
          .eq('store_id', targetStoreId);
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
              {
                data: null,
                error:
                  '이 매장에 이미 사용 중인 비밀번호입니다. 다른 비밀번호를 사용해 주세요.',
              },
              { status: 409 }
            );
          }
        }
      }
      update.password_hash = await hashPassword(body.password);
      update.password_updated_at = new Date().toISOString();
      update.password_plain = body.password;
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

    // 근무지 매장 교체 — store_code 가 login_id 이므로 매장 변경 시 login_id 도 동기화.
    if (body.store_id) {
      const { data: newStore } = await db
        .from('fo_stores')
        .select('store_code')
        .eq('id', body.store_id)
        .maybeSingle();
      if (!newStore?.store_code) {
        return NextResponse.json(
          { data: null, error: '근무지 매장을 찾을 수 없습니다.' },
          { status: 400 }
        );
      }
      await db.from('fo_staff_store_scopes').delete().eq('user_id', id);
      const { error: scopeErr } = await db
        .from('fo_staff_store_scopes')
        .insert({ user_id: id, store_id: body.store_id });
      if (scopeErr) {
        return NextResponse.json({ data: null, error: scopeErr.message }, { status: 500 });
      }
      await db
        .from('fo_staff_profiles')
        .update({ login_id: newStore.store_code })
        .eq('user_id', id);
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
