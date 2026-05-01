// Frame Ops Web — /api/sales/refund (POST)
// 환불 처리 — fo_returns + fo_return_lines INSERT + 재고 증가.
// fo_sale_items 의 quantity > 0 CHECK 제약 때문에 sale 테이블에 음수 qty 를 넣을 수 없으므로
// 별도 반품 테이블에 기록한다.
//
// 결제 수단(현금/카드 환불액) 은 note 필드에 JSON 으로 기록 — 추후 settlement RPC 가 반영하도록 확장 예정.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

interface RefundLine {
  product_id: string;
  quantity: number;   // 양수 — 반품 수량
  unit_price: number;
}

interface CreateRefundPayload {
  store_id: string;
  items: RefundLine[];
  original_sale_id?: string | null;
  cash_amount?: number;   // 환불 현금 (양수 = 환불액, 0 가능)
  card_amount?: number;   // 환불 카드 (양수 = 환불액, 0 가능)
  discount_total?: number;
  seller_user_id?: string | null;
  seller_label?: string | null;
  note?: string | null;
  idempotency_key: string;
  /** ISO timestamp; null/undefined → 서버 NOW() */
  returned_at?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateRefundPayload;

    if (!body.idempotency_key) {
      return NextResponse.json(
        { data: null, error: 'idempotency_key 는 필수입니다.' },
        { status: 400 }
      );
    }
    if (!body.store_id) {
      return NextResponse.json(
        { data: null, error: 'store_id 는 필수입니다.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { data: null, error: 'items 는 최소 1개 이상 필요합니다.' },
        { status: 400 }
      );
    }
    for (const it of body.items) {
      if (!it.product_id || !Number.isFinite(it.quantity) || it.quantity <= 0) {
        return NextResponse.json(
          { data: null, error: '각 항목은 product_id 와 양수 quantity 를 가져야 합니다 (환불은 절대값 사용).' },
          { status: 400 }
        );
      }
    }

    const db = getDB();

    // 결제 수단/담당자 메타 — note 에 JSON 으로 보관 (스키마 확장 전까지)
    const meta = {
      cash_amount: body.cash_amount ?? 0,
      card_amount: body.card_amount ?? 0,
      discount_total: body.discount_total ?? 0,
      seller_user_id: body.seller_user_id ?? null,
      seller_label: body.seller_label ?? null,
      idempotency_key: body.idempotency_key,
    };
    const noteCombined = `${body.note ?? ''}${body.note ? ' | ' : ''}${JSON.stringify(meta)}`;

    // 1) fo_returns 헤더
    const { data: ret, error: hErr } = await db
      .from('fo_returns')
      .insert({
        store_id: body.store_id,
        original_sale_id: body.original_sale_id ?? null,
        returned_at: body.returned_at ?? new Date().toISOString(),
        note: noteCombined,
      })
      .select('id, returned_at')
      .single();
    if (hErr || !ret) {
      return NextResponse.json(
        { data: null, error: hErr?.message ?? '환불 헤더 생성 실패' },
        { status: 500 }
      );
    }

    // 2) fo_return_lines
    const linesPayload = body.items.map((it) => ({
      return_id: ret.id,
      product_id: it.product_id,
      quantity: Math.floor(it.quantity),
      unit_price: it.unit_price,
    }));
    const { error: lErr } = await db.from('fo_return_lines').insert(linesPayload);
    if (lErr) {
      // 헤더 롤백 (best-effort)
      await db.from('fo_returns').delete().eq('id', ret.id);
      return NextResponse.json({ data: null, error: lErr.message }, { status: 500 });
    }

    // 3) 재고 증가 — fo_products.stock_quantity += qty (반품 입고)
    for (const it of body.items) {
      const { data: prod } = await db
        .from('fo_products')
        .select('stock_quantity')
        .eq('id', it.product_id)
        .maybeSingle();
      const cur = prod?.stock_quantity ?? 0;
      await db
        .from('fo_products')
        .update({ stock_quantity: cur + Math.floor(it.quantity) })
        .eq('id', it.product_id);
    }

    return NextResponse.json({
      data: {
        return_id: ret.id,
        returned_at: ret.returned_at,
        items_returned: linesPayload.length,
        total_refund:
          (body.cash_amount ?? 0) + (body.card_amount ?? 0),
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
