// Frame Ops Web — /api/orders (→ fo_sales 테이블)
// GET: 매출 목록
// POST: 신규 매출 등록 (POS 결제 완료 시)

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const storeCode = searchParams.get('store_code') ?? process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE;
    const dateFrom  = searchParams.get('date_from');
    const dateTo    = searchParams.get('date_to');
    const limit     = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const page      = Number(searchParams.get('page') ?? 0);

    const db = getDB();

    // 매장 ID 조회
    let storeId: string | null = null;
    if (storeCode) {
      const { data: store } = await db
        .from('fo_stores')
        .select('id')
        .eq('store_code', storeCode)
        .single();
      storeId = store?.id ?? null;
    }

    let query = db
      .from('fo_sales')
      .select('*')
      .order('sold_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (storeId) query = query.eq('store_id', storeId);
    if (dateFrom) query = query.gte('sold_at', dateFrom);
    if (dateTo)   query = query.lte('sold_at', dateTo);

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
      .from('fo_sales')
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
