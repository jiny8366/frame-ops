// Frame Ops Web — /api/admin/stats
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → 기간 합계 + 월누적 + Top 상품 리스트

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const db = getDB();
  const [statsRes, topRes] = await Promise.all([
    db.rpc('get_sales_stats', { p_store_id: session.store_id, p_from: from, p_to: to }),
    db.rpc('get_top_products', {
      p_store_id: session.store_id,
      p_from: from,
      p_to: to,
      p_limit: limit,
    }),
  ]);

  if (statsRes.error) {
    return NextResponse.json({ data: null, error: statsRes.error.message }, { status: 500 });
  }
  if (topRes.error) {
    return NextResponse.json({ data: null, error: topRes.error.message }, { status: 500 });
  }

  // 환불 보정 — 기간 내 fo_returns + 라인(제품·브랜드 포함) 일괄 조회 → summary/top_products 모두 보정.
  const { data: retList } = await db
    .from('fo_returns')
    .select('id, note, returned_at')
    .eq('store_id', session.store_id)
    .gte('returned_at', from)
    .lte('returned_at', `${to}T23:59:59.999`);
  interface RefundLineWithProduct {
    quantity: number;
    unit_price: number;
    return_id: string;
    product_id: string;
    product: {
      style_code: string | null;
      color_code: string | null;
      display_name: string | null;
      brand: { name: string | null } | null;
    } | null;
  }
  let retLinesWithProduct: RefundLineWithProduct[] = [];
  if (retList && retList.length > 0) {
    const { data: rl } = await db
      .from('fo_return_lines')
      .select(
        `quantity, unit_price, return_id, product_id,
         product:fo_products(style_code, color_code, display_name, brand:fo_brands(name))`
      )
      .in('return_id', retList.map((r) => r.id));
    retLinesWithProduct = (rl ?? []) as unknown as RefundLineWithProduct[];
  }
  // note JSON 으로 cash/card 합계
  function parseRetNote(note: string | null | undefined) {
    if (!note) return { cash: 0, card: 0 };
    const m = note.match(/\{[^{}]*\}\s*$/);
    if (!m) return { cash: 0, card: 0 };
    try {
      const j = JSON.parse(m[0]);
      return { cash: Number(j.cash_amount ?? 0), card: Number(j.card_amount ?? 0) };
    } catch {
      return { cash: 0, card: 0 };
    }
  }
  let periodCash = 0;
  let periodCard = 0;
  let periodAmount = 0;
  let periodQty = 0;
  for (const r of retList ?? []) {
    const m = parseRetNote(r.note);
    periodCash += m.cash;
    periodCard += m.card;
  }
  for (const l of retLinesWithProduct) {
    periodAmount += l.quantity * l.unit_price;
    periodQty += l.quantity;
  }
  const periodReturns = {
    count: retList?.length ?? 0,
    itemsCount: retLinesWithProduct.length,
    qty: periodQty,
    amount: periodAmount,
    cashRefund: periodCash,
    cardRefund: periodCard,
  };
  // 당월 시작일 계산 (Asia/Seoul 기준)
  const seoulNow = new Date(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  );
  const monthStart = `${seoulNow.getFullYear()}-${String(seoulNow.getMonth() + 1).padStart(2, '0')}-01`;
  const monthReturns = await fetchReturnsTotals(db, monthStart, to, session.store_id);

  const baseSummary = statsRes.data?.[0] as
    | {
        period_cash?: number;
        period_card?: number;
        period_revenue?: number;
        period_count?: number;
        month_cash?: number;
        month_card?: number;
        month_revenue?: number;
      }
    | null
    | undefined;
  const adjustedSummary = baseSummary
    ? {
        ...baseSummary,
        period_revenue: (baseSummary.period_revenue ?? 0) - periodReturns.amount,
        period_cash: (baseSummary.period_cash ?? 0) - periodReturns.cashRefund,
        period_card: (baseSummary.period_card ?? 0) - periodReturns.cardRefund,
        month_revenue: (baseSummary.month_revenue ?? 0) - monthReturns.amount,
        month_cash: (baseSummary.month_cash ?? 0) - monthReturns.cashRefund,
        month_card: (baseSummary.month_card ?? 0) - monthReturns.cardRefund,
      }
    : null;
  const returns = periodReturns;

  // top_products 보정 — 제품별 환불 집계 후 머지
  interface TopProductRow {
    product_id: string;
    brand_name: string | null;
    style_code: string | null;
    color_code: string | null;
    display_name: string | null;
    total_quantity: number;
    total_revenue: number;
  }
  const refundByProduct = new Map<
    string,
    { product_id: string; brand_name: string | null; style_code: string | null; color_code: string | null; display_name: string | null; quantity: number; revenue: number }
  >();
  for (const l of retLinesWithProduct) {
    const e = refundByProduct.get(l.product_id) ?? {
      product_id: l.product_id,
      brand_name: l.product?.brand?.name ?? null,
      style_code: l.product?.style_code ?? null,
      color_code: l.product?.color_code ?? null,
      display_name: l.product?.display_name ?? null,
      quantity: 0,
      revenue: 0,
    };
    e.quantity += l.quantity;
    e.revenue += l.quantity * l.unit_price;
    refundByProduct.set(l.product_id, e);
  }
  const baseTop = (topRes.data ?? []) as unknown as TopProductRow[];
  const productMap = new Map<string, TopProductRow>();
  for (const p of baseTop) productMap.set(p.product_id, { ...p });
  for (const r of refundByProduct.values()) {
    const exist = productMap.get(r.product_id);
    if (exist) {
      exist.total_quantity = exist.total_quantity - r.quantity;
      exist.total_revenue = exist.total_revenue - r.revenue;
    } else {
      productMap.set(r.product_id, {
        product_id: r.product_id,
        brand_name: r.brand_name,
        style_code: r.style_code,
        color_code: r.color_code,
        display_name: r.display_name,
        total_quantity: -r.quantity,
        total_revenue: -r.revenue,
      });
    }
  }
  const adjustedTop = Array.from(productMap.values()).sort(
    (a, b) => b.total_revenue - a.total_revenue
  );

  return NextResponse.json({
    data: {
      period: { from, to },
      summary: adjustedSummary,
      top_products: adjustedTop,
      returns_summary: {
        count: returns.count,
        items: returns.itemsCount,
        qty: returns.qty,
        amount: returns.amount,
        cash_refund: returns.cashRefund,
        card_refund: returns.cardRefund,
      },
    },
    error: null,
  });
}
