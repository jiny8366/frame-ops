// Frame Ops Web — /api/admin/inbound
// GET: 매입 내역 리스트 — 매입처/날짜/상품 검색 필터.
// POST: 매입(입고) 등록 — fo_inbound_receipts + fo_inbound_lines 생성 + 재고 증가 원자 처리.

import { NextRequest, NextResponse } from 'next/server';
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

interface ProductRef {
  id: string;
  product_code: string | null;
  display_name: string | null;
  brand_id: string | null;
  style_code: string | null;
  color_code: string | null;
  category: string | null;
  brand: { name: string | null } | null;
}

interface SupplierRef {
  name: string | null;
  supplier_code: string | null;
}

interface ReceiptListRow {
  id: string;
  document_at: string;
  note: string | null;
  created_at: string;
  supplier_id: string | null;
  supplier: SupplierRef | null;
  lines: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
    product: ProductRef | null;
  }>;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const supplierId = sp.get('supplier_id');
  const dateFrom = sp.get('date_from'); // YYYY-MM-DD
  const dateTo = sp.get('date_to');     // YYYY-MM-DD
  const productQuery = (sp.get('product_query') ?? '').trim();
  const limit = Math.min(Number(sp.get('limit') ?? 200), 500);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);

  const db = getDB();
  let q = db
    .from('fo_inbound_receipts')
    .select(
      `id, document_at, note, created_at, supplier_id,
       supplier:fo_suppliers(name, supplier_code),
       lines:fo_inbound_lines(
         id, product_id, quantity, unit_cost,
         product:fo_products(id, product_code, display_name, brand_id, style_code, color_code, category,
           brand:fo_brands(name))
       )`
    )
    .eq('store_id', session.store_id)
    .order('document_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (supplierId) q = q.eq('supplier_id', supplierId);
  if (dateFrom) q = q.gte('document_at', dateFrom);
  if (dateTo) q = q.lte('document_at', `${dateTo}T23:59:59`);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 상품 검색은 client-side filter (라인 중 매치되면 receipt 통과). 200건 이내 OK.
  let receipts = (data ?? []) as unknown as ReceiptListRow[];
  if (productQuery) {
    const lcq = productQuery.toLowerCase();
    receipts = receipts.filter((r) =>
      (r.lines ?? []).some((l) => {
        const p = l.product;
        if (!p) return false;
        return (
          (p.product_code ?? '').toLowerCase().includes(lcq) ||
          (p.display_name ?? '').toLowerCase().includes(lcq) ||
          (p.style_code ?? '').toLowerCase().includes(lcq) ||
          (p.color_code ?? '').toLowerCase().includes(lcq)
        );
      })
    );
  }

  return NextResponse.json({ data: receipts, error: null });
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
