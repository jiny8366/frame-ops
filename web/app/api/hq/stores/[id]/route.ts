// Frame Ops Web — /api/hq/stores/[id]
// PATCH: 매장 정보 + 활성 토글 (store_code 도 변경 가능 — HQ 전용)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import type { Database } from '@/types/database';

type StoreUpdate = Database['public']['Tables']['fo_stores']['Update'];

interface PatchBody {
  store_code?: string;
  name?: string;
  address?: string | null;
  phone?: string | null;
  business_reg_no?: string | null;
  active?: boolean;
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
  try {
    const body = (await request.json()) as PatchBody;
    const update: StoreUpdate = {};
    if (body.store_code !== undefined) update.store_code = body.store_code.trim().toUpperCase();
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.address !== undefined) update.address = body.address?.trim() || undefined;
    if (body.phone !== undefined) update.phone = body.phone?.trim() || undefined;
    if (body.business_reg_no !== undefined)
      update.business_reg_no = body.business_reg_no?.trim() || undefined;
    if (body.active !== undefined) update.active = body.active;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_stores')
      .update(update)
      .eq('id', id)
      .select('id, store_code, name, address, phone, business_reg_no, active')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
