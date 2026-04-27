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

      // 1) sale_items 메타 업데이트 (입고 / 차액 처리)
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

      // 2) 실제 재고 증가 (received_qty 만큼)
      if (recv > 0) {
        const { data: prod } = await db
          .from('fo_products')
          .select('stock_quantity')
          .eq('id', item.product_id)
          .single();
        const cur = prod?.stock_quantity ?? 0;
        const { error: updErr } = await db
          .from('fo_products')
          .update({ stock_quantity: cur + recv })
          .eq('id', item.product_id);
        if (updErr) {
          results.push({
            product_id: item.product_id,
            ok: false,
            error: `재고 갱신 실패: ${updErr.message}`,
          });
          continue;
        }
      }

      results.push({ product_id: item.product_id, ok: true });
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
