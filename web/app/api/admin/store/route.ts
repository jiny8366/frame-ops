// Frame Ops Web — /api/admin/store
// GET: 현재 세션 매장 정보 (geo 정보 포함)
// PATCH: 매장 정보 수정 + 출퇴근 위치 정책 (lat/lng/반경/강제)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import type { Database } from '@/types/database';

type StoreUpdate = Database['public']['Tables']['fo_stores']['Update'];

interface PatchBody {
  name?: string;
  address?: string | null;
  phone?: string | null;
  business_reg_no?: string | null;
  active?: boolean;
  lat?: number | null;
  lng?: number | null;
  geo_radius_m?: number | null;
  geo_required?: boolean;
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const { data, error } = await db
    .from('fo_stores')
    .select(
      'id, store_code, name, address, phone, business_reg_no, active, lat, lng, geo_radius_m, geo_required, created_at, updated_at'
    )
    .eq('id', session.store_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PatchBody;
    const update: StoreUpdate = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.address !== undefined) update.address = body.address ?? undefined;
    if (body.phone !== undefined) update.phone = body.phone ?? undefined;
    if (body.business_reg_no !== undefined) update.business_reg_no = body.business_reg_no ?? undefined;
    if (body.active !== undefined) update.active = body.active;
    if (body.lat !== undefined) update.lat = body.lat;
    if (body.lng !== undefined) update.lng = body.lng;
    if (body.geo_radius_m !== undefined) update.geo_radius_m = body.geo_radius_m;
    if (body.geo_required !== undefined) update.geo_required = body.geo_required;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_stores')
      .update(update)
      .eq('id', session.store_id)
      .select(
        'id, store_code, name, address, phone, business_reg_no, active, lat, lng, geo_radius_m, geo_required'
      )
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
