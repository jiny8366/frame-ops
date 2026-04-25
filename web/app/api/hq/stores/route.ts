// Frame Ops Web — /api/hq/stores
// GET: 전 매장 리스트 (활성/비활성 모두) + geo 정보
// POST: 신규 매장 등록 (선택적으로 geo 포함)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const db = getDB();
  const { data, error } = await db
    .from('fo_stores')
    .select(
      'id, store_code, name, address, phone, business_reg_no, active, lat, lng, geo_radius_m, geo_required, created_at'
    )
    .order('active', { ascending: false })
    .order('store_code', { ascending: true });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}

interface CreateBody {
  store_code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  business_reg_no?: string | null;
  lat?: number | null;
  lng?: number | null;
  geo_radius_m?: number | null;
  geo_required?: boolean;
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  try {
    const body = (await request.json()) as CreateBody;
    const code = (body.store_code ?? '').trim().toUpperCase();
    const name = (body.name ?? '').trim();
    if (!code || !name) {
      return NextResponse.json(
        { data: null, error: '매장 코드와 매장명은 필수입니다.' },
        { status: 400 }
      );
    }
    const db = getDB();
    const { data, error } = await db
      .from('fo_stores')
      .insert({
        store_code: code,
        name,
        address: body.address?.trim() ?? undefined,
        phone: body.phone?.trim() ?? undefined,
        business_reg_no: body.business_reg_no?.trim() ?? undefined,
        lat: body.lat,
        lng: body.lng,
        geo_radius_m: body.geo_radius_m,
        geo_required: body.geo_required ?? false,
        active: true,
      })
      .select(
        'id, store_code, name, address, phone, business_reg_no, active, lat, lng, geo_radius_m, geo_required'
      )
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
