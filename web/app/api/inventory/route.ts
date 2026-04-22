// Frame Ops Web — /api/inventory
// GET: 재고 현황
// ⚠️  fo_inventory 테이블 미존재 — 실제 테이블명 확인 필요
// 현재는 fo_products의 status 기반으로 재고 파악

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const brandId = searchParams.get('brand_id');
    const limit   = Math.min(Number(searchParams.get('limit') ?? 100), 500);
    const page    = Number(searchParams.get('page') ?? 0);

    const db = getDB();

    // fo_inventory 테이블이 없으므로 fo_products에서 active 상품을 재고 대용으로 반환
    let query = db
      .from('fo_products')
      .select('*, brand:fo_brands(id, name)')
      .eq('status', 'active')
      .order('style_code', { ascending: true })
      .range(page * limit, (page + 1) * limit - 1);

    if (brandId) query = query.eq('brand_id', brandId);

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
