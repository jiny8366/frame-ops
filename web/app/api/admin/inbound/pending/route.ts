// Frame Ops Web — /api/admin/inbound/pending
// GET  → 매입 대기 = 발주처리됐으나 매입 안 된 sale_items 의 매입처×제품별 집계
// POST → 매입 처리 일괄: { items: [{ product_id, received_qty, remainder_action }], ... }

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface Row {
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_code: string | null;
  product_id: string;
  brand_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  ordered_at_min: string | null;
  ordered_qty: number;
  cost_price: number;
}

const UNASSIGNED_KEY = '__unassigned__';
const UNASSIGNED_NAME = '매입처 미지정';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const db = getDB();
  const { data, error } = await (db.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: Row[] | null; error: { message: string } | null }>)(
    'get_inbound_pending',
    { p_store_id: session.store_id }
  );

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    supplier_id: r.supplier_id ?? UNASSIGNED_KEY,
    supplier_name: r.supplier_name ?? UNASSIGNED_NAME,
  }));

  return NextResponse.json({ data: { rows }, error: null });
}

interface InboundItem {
  product_id: string;
  received_qty: number;
  /** 차액 처리 방식: 'pending' = 주문대기 복귀, 'hold' = 주문보류, 'none' = 차액 없음 */
  remainder_action?: 'pending' | 'hold' | 'none';
}

interface PostBody {
  items: InboundItem[];
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as PostBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { data: null, error: 'items 배열이 비어있습니다.' },
        { status: 400 }
      );
    }

    const db = getDB();
    const results: Array<{
      product_id: string;
      ok: boolean;
      error?: string;
    }> = [];

    // 1) 모든 상품 정보 한 번에 로드 (cost_price + supplier_id)
    const productIds = body.items.map((i) => i.product_id).filter(Boolean);
    const { data: products } = await db
      .from('fo_products')
      .select('id, cost_price, supplier_id')
      .in('id', productIds);
    const productInfo = new Map<string, { cost_price: number; supplier_id: string | null }>();
    for (const p of products ?? []) {
      productInfo.set(p.id, {
        cost_price: p.cost_price ?? 0,
        supplier_id: p.supplier_id,
      });
    }

    // 2) 매입처별로 그룹화하여 receipt 생성용 라인 준비
    const receiptLinesBySupplier = new Map<
      string,
      Array<{ product_id: string; quantity: number; unit_cost: number }>
    >();
    const NULL_KEY = '__null__';

    for (const item of body.items) {
      if (!item.product_id || typeof item.received_qty !== 'number') {
        results.push({
          product_id: item.product_id ?? '?',
          ok: false,
          error: 'product_id 또는 received_qty 가 잘못됨',
        });
        continue;
      }
      const recv = Math.max(0, Math.round(item.received_qty));
      const action: 'pending' | 'hold' | 'none' = item.remainder_action ?? 'none';

      // 1) sale_items 메타 업데이트 (입고 / 차액 처리) — 재고 갱신은 RPC 가 안 함, 아래 receipt 가 처리
      const { error: rpcErr } = await (db.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'mark_inbound_for_product',
        {
          p_store_id: session.store_id,
          p_product_id: item.product_id,
          p_received_qty: recv,
          p_remainder_action: action,
          p_user_id: session.staff_user_id,
        }
      );
      if (rpcErr) {
        results.push({ product_id: item.product_id, ok: false, error: rpcErr.message });
        continue;
      }

      // 2) 매입처별 receipt 라인에 누적 (cost_price 는 상품 마스터에서)
      if (recv > 0) {
        const info = productInfo.get(item.product_id);
        const supplierKey = info?.supplier_id ?? NULL_KEY;
        const arr = receiptLinesBySupplier.get(supplierKey) ?? [];
        arr.push({
          product_id: item.product_id,
          quantity: recv,
          unit_cost: info?.cost_price ?? 0,
        });
        receiptLinesBySupplier.set(supplierKey, arr);
      }

      results.push({ product_id: item.product_id, ok: true });
    }

    // 3) 매입처별로 receipt 일괄 생성 (재고 증가 포함 — create_inbound_receipt RPC)
    for (const [supplierKey, lines] of receiptLinesBySupplier.entries()) {
      if (lines.length === 0) continue;
      const supplierId = supplierKey === NULL_KEY ? null : supplierKey;
      const { error: receiptErr } = await (db.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'create_inbound_receipt',
        {
          p_store_id: session.store_id,
          p_supplier_id: supplierId,
          p_document_at: null,
          p_note: '주문리스트 매입 처리',
          p_lines: lines,
        }
      );
      if (receiptErr) {
        // 재고 갱신 실패 — 결과에 표시
        for (const l of lines) {
          const idx = results.findIndex((r) => r.product_id === l.product_id);
          if (idx >= 0) {
            results[idx] = {
              product_id: l.product_id,
              ok: false,
              error: `재고/매입전표 갱신 실패: ${receiptErr.message}`,
            };
          }
        }
      }
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({
      data: { processed: results.length - failed.length, failed: failed.length, results },
      error: failed.length > 0 ? `${failed.length}건 실패` : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
