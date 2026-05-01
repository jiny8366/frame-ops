// Frame Ops Web — /api/hq/dashboard v3
// 시간대별 매출·수량 = 현재 시점 직전 12시간 (날짜 지정 없음)
// 매장 셀렉터로 전체 또는 단일 매장.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';

interface DashboardSummary {
  revenue: number;
  cost: number;
  profit: number;
  sale_count: number;
  item_count: number;
}

interface HourlyPoint {
  hour: number;
  label: string;
  revenue: number;
  qty: number;
}

interface ProductRow {
  product_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  quantity: number;
  revenue: number;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const storeId = url.searchParams.get('store_id') || null;

  const db = getDB();

  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name')
    .eq('active', true)
    .order('store_code', { ascending: true });

  const { data: rpcData, error } = await db.rpc('get_hq_dashboard_v3', {
    p_store_id: storeId,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const result = rpcData as unknown as {
    summary: DashboardSummary;
    hourly: HourlyPoint[];
    products: ProductRow[];
    window_start: string;
    window_end: string;
  };

  // 환불 보정 — 직전 12시간 윈도우의 fo_returns 차감.
  // window_start 가 RPC 결과에 없을 수 있으므로 fallback: 현재 시각 기준 -12h.
  const nowMs = Date.now();
  const winStartIso = result?.window_start ?? new Date(nowMs - 12 * 60 * 60 * 1000).toISOString();
  const winEndIso = result?.window_end ?? new Date(nowMs).toISOString();

  // returned_at 정확한 시간 비교를 위해 직접 supabase 쿼리 (날짜 단위 fetchReturnsTotals 대신 시각 단위)
  let retQ = db
    .from('fo_returns')
    .select('id, note, store_id, returned_at')
    .gte('returned_at', winStartIso)
    .lte('returned_at', winEndIso);
  if (storeId) retQ = retQ.eq('store_id', storeId);
  const { data: retList } = await retQ;

  // 환불 라인 — 제품·브랜드 정보까지 함께 조회 (top products 차감용)
  interface RefundLine {
    quantity: number;
    unit_price: number;
    return_id: string;
    product_id: string;
    product: {
      style_code: string | null;
      color_code: string | null;
      brand: { name: string | null } | null;
    } | null;
  }
  let retLines: RefundLine[] = [];
  if (retList && retList.length > 0) {
    const { data: rLines } = await db
      .from('fo_return_lines')
      .select(
        `quantity, unit_price, return_id, product_id,
         product:fo_products(style_code, color_code, brand:fo_brands(name))`
      )
      .in('return_id', retList.map((r) => r.id));
    retLines = (rLines ?? []) as unknown as RefundLine[];
  }

  let retAmount = 0;
  let retQty = 0;
  let retItems = 0;
  // 제품별 환불 집계 (top products 보정용)
  const refundByProduct = new Map<
    string,
    { product_id: string; brand_name: string; style_code: string | null; color_code: string | null; quantity: number; revenue: number }
  >();
  for (const l of retLines) {
    retItems += 1;
    retQty += l.quantity;
    retAmount += l.quantity * l.unit_price;
    const e = refundByProduct.get(l.product_id) ?? {
      product_id: l.product_id,
      brand_name: l.product?.brand?.name ?? '',
      style_code: l.product?.style_code ?? null,
      color_code: l.product?.color_code ?? null,
      quantity: 0,
      revenue: 0,
    };
    e.quantity += l.quantity;
    e.revenue += l.quantity * l.unit_price;
    refundByProduct.set(l.product_id, e);
  }
  const returnsAdjusted = {
    count: retList?.length ?? 0,
    items: retItems,
    qty: retQty,
    amount: retAmount,
  };

  const baseSummary = result?.summary ?? {
    revenue: 0,
    cost: 0,
    profit: 0,
    sale_count: 0,
    item_count: 0,
  };
  const adjSummary = {
    revenue: baseSummary.revenue - returnsAdjusted.amount,
    cost: baseSummary.cost,
    profit: baseSummary.profit - returnsAdjusted.amount,
    sale_count: baseSummary.sale_count,
    item_count: baseSummary.item_count - returnsAdjusted.qty,
  };

  // 시간대별(hourly) 차트 보정 — 환불을 시간(hour) 단위로 집계 후 매출/수량 차감
  const baseHourly = (result?.hourly ?? []) as HourlyPoint[];
  const refundByHour = new Map<number, { revenue: number; qty: number }>();
  if (retList && retList.length > 0) {
    const retById = new Map(retList.map((r) => [r.id, r.returned_at]));
    for (const l of retLines) {
      const at = retById.get(l.return_id);
      if (!at) continue;
      const h = new Date(at).getHours();
      const e = refundByHour.get(h) ?? { revenue: 0, qty: 0 };
      e.revenue += l.quantity * l.unit_price;
      e.qty += l.quantity;
      refundByHour.set(h, e);
    }
  }
  const adjustedHourly = baseHourly.map((p) => {
    const r = refundByHour.get(p.hour);
    if (!r) return p;
    return { ...p, revenue: p.revenue - r.revenue, qty: p.qty - r.qty };
  });

  // 판매 상품 리스트 — 기존 항목에서 환불 차감 + 환불만 있는 제품도 음수로 추가
  const baseProducts = (result?.products ?? []) as ProductRow[];
  const productMap = new Map<string, ProductRow>();
  for (const p of baseProducts) {
    productMap.set(p.product_id, { ...p });
  }
  for (const r of refundByProduct.values()) {
    const exist = productMap.get(r.product_id);
    if (exist) {
      // 기존 판매 행에서 차감 (음수 가능)
      exist.quantity = exist.quantity - r.quantity;
      exist.revenue = exist.revenue - r.revenue;
    } else {
      // 환불만 있는 제품 — 음수로 신규 추가
      productMap.set(r.product_id, {
        product_id: r.product_id,
        brand_name: r.brand_name,
        style_code: r.style_code,
        color_code: r.color_code,
        quantity: -r.quantity,
        revenue: -r.revenue,
      });
    }
  }
  const adjustedProducts = Array.from(productMap.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  return NextResponse.json({
    data: {
      store_id: storeId,
      stores: stores ?? [],
      window_start: result?.window_start ?? null,
      window_end: result?.window_end ?? null,
      summary: adjSummary,
      hourly: adjustedHourly,
      products: adjustedProducts,
      returns_summary: returnsAdjusted,
    },
    error: null,
  });
}
