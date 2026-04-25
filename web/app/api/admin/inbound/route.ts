// Frame Ops Web — /api/admin/inbound
// POST: 매입(입고) 등록 — fo_inbound_receipts + fo_inbound_lines 생성 + 재고 증가 원자 처리.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface InboundLine {
  product_id: string;
  quantity: number;
  unit_cost?: number;
}

interface CreateInboundBody {
  supplier_id?: string | null;
  document_at?: string | null;
  note?: string | null;
  lines: InboundLine[];
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateInboundBody;

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { data: null, error: '입고 항목은 최소 1개 이상 필요합니다.' },
        { status: 400 }
      );
    }
    for (const l of body.lines) {
      if (!l.product_id || !l.quantity || l.quantity <= 0) {
        return NextResponse.json(
          { data: null, error: '각 항목은 product_id 와 0 보다 큰 quantity 를 가져야 합니다.' },
          { status: 400 }
        );
      }
    }

    const db = getDB();
    const { data, error } = await db.rpc('create_inbound_receipt', {
      p_store_id: session.store_id,
      p_supplier_id: body.supplier_id ?? null,
      p_document_at: body.document_at ?? null,
      p_note: body.note ?? null,
      p_lines: body.lines as unknown as never,
    });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data?.[0] ?? null, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
