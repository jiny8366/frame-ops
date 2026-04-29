// Frame Ops Web — /api/hq/sales-search
// HQ 전용. 모든 매장의 판매를 라인 단위로 평탄화.
// 일시 / 매장 / 브랜드 / 제품번호 / 컬러 / 수량 / 담당자 / 결제수단 / 금액

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

interface ProductRef {
  id: string;
  style_code: string | null;
  color_code: string | null;
  brand: { name: string | null } | null;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!session.role_code.startsWith('hq_')) {
    return NextResponse.json({ data: null, error: '본사 권한이 필요합니다.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const query = (url.searchParams.get('q') || '').trim();
  const storeId = url.searchParams.get('store_id');
  const limit = Math.min(Number(url.searchParams.get('limit') || 1000), 2000);

  const db = getDB();

  // 1) 기간/매장 필터로 sales 조회
  let salesQuery = db
    .from('fo_sales')
    .select(
      `id, sold_at, cash_amount, card_amount, discount_total, seller_user_id, seller_label, store_id`
    )
    .gte('sold_at', from)
    .lte('sold_at', `${to}T23:59:59.999`)
    .order('sold_at', { ascending: false })
    .limit(limit);
  if (storeId) salesQuery = salesQuery.eq('store_id', storeId);

  const { data: sales, error: sErr } = await salesQuery;
  if (sErr) {
    return NextResponse.json({ data: null, error: sErr.message }, { status: 500 });
  }
  const saleList = sales ?? [];

  // 매장 옵션 (필터 셀렉터용)
  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name, active')
    .eq('active', true)
    .order('store_code', { ascending: true });

  if (saleList.length === 0) {
    return NextResponse.json({ data: { rows: [], stores: stores ?? [] }, error: null });
  }

  // 2) 라인 + product/brand 조회
  const saleIds = saleList.map((s) => s.id);
  const { data: items, error: iErr } = await db
    .from('fo_sale_items')
    .select(
      `id, quantity, unit_price, discount_amount, sale_id,
       product:fo_products(id, style_code, color_code, brand:fo_brands(name))`
    )
    .in('sale_id', saleIds);
  if (iErr) {
    return NextResponse.json({ data: null, error: iErr.message }, { status: 500 });
  }

  // 3) 매장명 매핑
  const storeMap = new Map((stores ?? []).map((s) => [s.id, s]));

  // 4) 담당자명 매핑 (seller_label 미존재 시 fo_staff_profiles 조회)
  const userIds = Array.from(
    new Set(saleList.map((s) => s.seller_user_id).filter(Boolean) as string[])
  );
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: staff } = await db
      .from('fo_staff_profiles')
      .select('user_id, display_name')
      .in('user_id', userIds);
    nameMap = new Map((staff ?? []).map((s) => [s.user_id, s.display_name ?? '']));
  }
  const saleMap = new Map(saleList.map((s) => [s.id, s]));

  // 5) 평탄화
  interface LineRow {
    sale_id: string;
    item_id: string;
    sold_at: string;
    store_id: string;
    store_code: string;
    store_name: string;
    brand_name: string | null;
    style_code: string | null;
    color_code: string | null;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
    seller_name: string | null;
    payment_method: string;
  }

  const rowsRaw: LineRow[] = ((items ?? []) as unknown as Array<{
    id: string;
    quantity: number;
    unit_price: number;
    discount_amount: number;
    sale_id: string;
    product: ProductRef | null;
  }>).map((it) => {
    const s = saleMap.get(it.sale_id);
    const cash = s?.cash_amount ?? 0;
    const card = s?.card_amount ?? 0;
    const paymentMethod =
      cash > 0 && card > 0 ? '혼합' : cash > 0 ? '현금' : card > 0 ? '카드' : '기타';
    const sellerName =
      s?.seller_label ??
      (s?.seller_user_id ? nameMap.get(s.seller_user_id) ?? null : null);
    const store = s ? storeMap.get(s.store_id) : null;
    return {
      sale_id: s?.id ?? it.sale_id,
      item_id: it.id,
      sold_at: s?.sold_at ?? '',
      store_id: s?.store_id ?? '',
      store_code: store?.store_code ?? '',
      store_name: store?.name ?? '',
      brand_name: it.product?.brand?.name ?? null,
      style_code: it.product?.style_code ?? null,
      color_code: it.product?.color_code ?? null,
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount_amount: it.discount_amount,
      line_total: it.quantity * it.unit_price - it.discount_amount,
      seller_name: sellerName,
      payment_method: paymentMethod,
    };
  });

  // 6) 정렬
  rowsRaw.sort((a, b) => {
    if (b.sold_at !== a.sold_at) return b.sold_at < a.sold_at ? -1 : 1;
    return a.item_id < b.item_id ? -1 : 1;
  });

  // 7) 키워드 필터
  let rows = rowsRaw;
  if (query) {
    const lcq = query.toLowerCase();
    rows = rowsRaw.filter(
      (r) =>
        (r.brand_name ?? '').toLowerCase().includes(lcq) ||
        (r.style_code ?? '').toLowerCase().includes(lcq) ||
        (r.color_code ?? '').toLowerCase().includes(lcq)
    );
  }

  return NextResponse.json({
    data: { rows, stores: stores ?? [] },
    error: null,
  });
}
