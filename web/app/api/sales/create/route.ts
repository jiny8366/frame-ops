// Frame Ops Web — /api/sales/create (POST)
// RPC create_sale_with_items 호출. 판매 + 품목 + 재고 차감 원자 처리.
// idempotency_key 필수 — 중복 결제 방지.
//
// 런타임: Edge — Vercel cold-start 제거(node 함수는 idle 후 5~10초 지연 발생).
// Supabase 서비스롤 클라이언트는 fetch 기반이라 Edge 호환.

export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

interface CreateSalePayload {
  store_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
  }>;
  cash_amount: number;
  card_amount: number;
  discount_total: number;
  discount_type_code?: string;
  seller_user_id?: string;
  seller_code?: string;
  seller_label?: string;
  clerk_note?: string;
  idempotency_key: string;
  /** ISO timestamp; null/undefined → 서버 NOW() 사용 */
  sold_at?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateSalePayload;

    if (!body.idempotency_key) {
      return NextResponse.json(
        { data: null, error: 'idempotency_key 는 필수입니다.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { data: null, error: 'items 는 최소 1개 이상 필요합니다.' },
        { status: 400 }
      );
    }

    const db = getDB();
    const { data, error } = await db.rpc('create_sale_with_items', {
      p_store_id: body.store_id,
      p_items: body.items,
      p_cash_amount: body.cash_amount,
      p_card_amount: body.card_amount,
      p_discount_total: body.discount_total,
      p_discount_type_code: body.discount_type_code,
      p_seller_user_id: body.seller_user_id,
      p_seller_code: body.seller_code,
      p_seller_label: body.seller_label,
      p_clerk_note: body.clerk_note,
      p_idempotency_key: body.idempotency_key,
      p_sold_at: body.sold_at ?? null,
    });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    // RPC 는 단일 행을 returns table 로 돌려주므로 첫 행 추출
    return NextResponse.json({ data: data?.[0] ?? null, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
