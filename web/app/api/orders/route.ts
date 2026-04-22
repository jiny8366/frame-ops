// Frame Ops Web — /api/orders
// GET: 주문/매출 목록
// POST: 신규 주문 생성 (POS 결제 완료 시)

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
      .from('fo_orders')
      .select(`
        *,
        items:fo_order_items(
          *,
          product:fo_products(id, style_code, color_code, display_name)
        )
      `)
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    if (storeId) query = query.eq('store_id', storeId);
    if (dateFrom) query = query.gte('order_date', dateFrom);
    if (dateTo)   query = query.lte('order_date', dateTo);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDB();

    // 트랜잭션: 주문 + 주문 항목 동시 생성
    const { items, ...orderData } = body;

    const { data: order, error: orderError } = await db
      .from('fo_orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) throw orderError;

    if (items?.length) {
      const orderItems = items.map((item: Record<string, unknown>) => ({
        ...item,
        order_id: order.id,
      }));
      const { error: itemsError } = await db
        .from('fo_order_items')
        .insert(orderItems);
      if (itemsError) throw itemsError;
    }

    return NextResponse.json({ data: order, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}
