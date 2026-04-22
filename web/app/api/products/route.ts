// Frame Ops Web — /api/products
// GET: 제품 목록 조회 (브랜드, 스타일코드 prefix 필터)
// POST: 제품 등록

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const brandId  = searchParams.get('brand_id');
    const prefix   = searchParams.get('prefix') ?? '';
    const limit    = Math.min(Number(searchParams.get('limit') ?? 30), 100);
    const page     = Number(searchParams.get('page') ?? 0);
    const search   = searchParams.get('search') ?? '';

    const db = getDB();
    // 클라이언트가 실제로 사용하는 컬럼만 명시 (supplier_id 등 서버 전용 컬럼 제외)
    // brand는 !inner로 INNER JOIN 강제 — brand_id가 null인 제품은 카탈로그에서 배제
    let query = db
      .from('fo_products')
      .select(`
        id,
        brand_id,
        product_code,
        style_code,
        color_code,
        display_name,
        category,
        sale_price,
        cost_price,
        suggested_retail,
        barcode,
        product_line,
        status,
        created_at,
        updated_at,
        brand:fo_brands!inner(id, name)
      `)
      .not('style_code', 'like', '%:%')   // 콜론 포함 제품 제외
      .order('style_code', { ascending: true })
      .range(page * limit, (page + 1) * limit - 1);

    if (brandId)  query = query.eq('brand_id', brandId);
    if (prefix)   query = query.ilike('style_code', `${prefix}%`);
    if (search)   query = query.or(
      `style_code.ilike.%${search}%,display_name.ilike.%${search}%,color_code.ilike.%${search}%`
    );

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : typeof e === 'object' && e !== null ? JSON.stringify(e)
      : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDB();
    const { data, error } = await db
      .from('fo_products')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : typeof e === 'object' && e !== null ? JSON.stringify(e)
      : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
