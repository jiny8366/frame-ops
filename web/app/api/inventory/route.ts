// Frame Ops Web — /api/inventory
// GET: 매장별 재고 현황

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const storeCode = searchParams.get('store_code') ?? process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE;
    const brandId   = searchParams.get('brand_id');
    const limit     = Math.min(Number(searchParams.get('limit') ?? 100), 500);
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
      .from('fo_inventory')
      .select(`
        *,
        product:fo_products(
          id, style_code, color_code, display_name, sale_price, image_url,
          brand:fo_brands(id, brand_code, brand_name)
        )
      `)
      .gt('quantity', 0)
      .order('updated_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (storeId) query = query.eq('store_id', storeId);
    if (brandId) query = query.eq('product.brand_id', brandId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}
