// Frame Ops Web — /api/admin/orders/pending
// GET ?from=&to= → 미발주 sale_items 를 매입처별·제품 단위 합산.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

const UNASSIGNED_KEY = '__unassigned__';
const UNASSIGNED_NAME = '매입처 미지정';

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();

  const db = getDB();
  const { data, error } = await db.rpc('get_pending_orders', {
    p_store_id: session.store_id,
    p_from: from,
    p_to: to,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 응답: { period, store, groups: [{supplier, supplier_source, items, totals}] }
  // supplier_source — RPC 가 새로 반환:
  //   'direct'        : fo_products.supplier_id 로 명시 지정
  //   'brand_mapping' : fo_supplier_brands(브랜드→매입처) 매핑으로 자동 결정
  //   'unassigned'    : 둘 다 없음 — '매입처 미지정' 그룹
  type PendingOrderRow = (typeof data extends Array<infer R> ? R : never) & {
    supplier_source?: 'direct' | 'brand_mapping' | 'unassigned';
    product_line?: string | null;
    category?: string | null;
    current_stock?: number;
  };
  const rows = (data ?? []) as PendingOrderRow[];

  // 라인/카테고리/현재고 — RPC 미반환 → fo_products 별도 조회로 보강
  const productIds = Array.from(new Set(rows.map((r) => r.product_id)));
  if (productIds.length > 0) {
    const { data: meta } = await db
      .from('fo_products')
      .select('id, product_line, category, stock_quantity')
      .in('id', productIds);
    const metaMap = new Map((meta ?? []).map((m) => [m.id, m]));
    for (const r of rows) {
      const m = metaMap.get(r.product_id);
      r.product_line = m?.product_line ?? null;
      r.category = m?.category ?? null;
      r.current_stock = m?.stock_quantity ?? 0;
    }
  }
  const groupsMap = new Map<
    string,
    {
      supplier_id: string;
      supplier_name: string;
      supplier_code: string | null;
      supplier_business_number: string | null;
      supplier_address: string | null;
      supplier_contact: string | null;
      /** 그룹 내 모든 라인의 supplier_source 가 동일하면 그 값, 혼합이면 'mixed'. */
      supplier_source: 'direct' | 'brand_mapping' | 'unassigned' | 'mixed';
      items: typeof rows;
      total_quantity: number;
      total_revenue: number;
      total_cost: number;
    }
  >();

  for (const r of rows) {
    const key = r.supplier_id ?? UNASSIGNED_KEY;
    const src = r.supplier_source ?? (r.supplier_id ? 'direct' : 'unassigned');
    let g = groupsMap.get(key);
    if (!g) {
      g = {
        supplier_id: r.supplier_id ?? UNASSIGNED_KEY,
        supplier_name: r.supplier_name ?? UNASSIGNED_NAME,
        supplier_code: r.supplier_code,
        supplier_business_number: null,
        supplier_address: null,
        supplier_contact: null,
        supplier_source: src,
        items: [],
        total_quantity: 0,
        total_revenue: 0,
        total_cost: 0,
      };
      groupsMap.set(key, g);
    } else if (g.supplier_source !== src) {
      g.supplier_source = 'mixed';
    }
    g.items.push(r);
    g.total_quantity += r.total_quantity;
    g.total_revenue += r.total_quantity * r.unit_price;
    g.total_cost += r.total_quantity * r.cost_price;
  }

  // 매입처 상세 정보 일괄 조회 (PDF 인쇄용 발주처/수주처 표시)
  const supplierIds = Array.from(groupsMap.values())
    .map((g) => g.supplier_id)
    .filter((id) => id !== UNASSIGNED_KEY);
  if (supplierIds.length > 0) {
    const { data: suppliers } = await db
      .from('fo_suppliers')
      .select('id, business_number, address, contact')
      .in('id', supplierIds);
    for (const s of suppliers ?? []) {
      const g = groupsMap.get(s.id);
      if (g) {
        g.supplier_business_number = s.business_number;
        g.supplier_address = s.address;
        g.supplier_contact = s.contact;
      }
    }
  }

  // 매장 정보
  const { data: store } = await db
    .from('fo_stores')
    .select('id, store_code, name, address, phone, business_reg_no')
    .eq('id', session.store_id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      period: { from, to },
      store,
      groups: Array.from(groupsMap.values()),
    },
    error: null,
  });
}
