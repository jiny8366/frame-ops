// Frame Ops Web — /api/admin/transfers
// GET: 점간이동 내역 (라인 단위 평탄화).
// POST: 새 점간이동 생성 — fo_interstore_transfers + fo_interstore_transfer_lines.
//
// 권한 가드:
// - HQ 사용자(hq_*) — from_store / to_store 자유 선택.
// - 지점 매니저(store_manager) — from_store 는 본인 매장 강제.
// - 그 외 — 거부.
//
// 주의(MVP 한계):
// - 재고 자동 반영은 운영 RPC 추가 시 동작. 현재는 거래 기록만 남김.
// - 라인의 unit_cost 기본값은 fo_products.cost_price (등록 시 매입가).

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

interface TransferLineInput {
  product_id: string;
  quantity: number;
  unit_cost?: number;
}

interface CreateBody {
  from_store_id: string;
  to_store_id: string;
  document_at?: string | null;
  note?: string | null;
  lines: TransferLineInput[];
}

function isHqRole(role: string): boolean {
  return role.startsWith('hq_');
}

// ── GET: 라인 단위 내역 조회 ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json(
      { data: null, error: '점간이동 권한이 없습니다.' },
      { status: 403 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const fromStoreId = sp.get('from_store_id');
  const toStoreId = sp.get('to_store_id');
  const dateFrom = sp.get('date_from');
  const dateTo = sp.get('date_to');
  const productQuery = (sp.get('product_query') ?? '').trim();
  const limit = Math.min(Number(sp.get('limit') ?? 200), 500);

  const db = getDB();
  let q = db
    .from('fo_interstore_transfers')
    .select(
      `id, document_at, note, status, created_at, decided_at,
       from_store_id, to_store_id,
       from_store:fo_stores!fo_interstore_transfers_from_store_id_fkey(id, store_code, name),
       to_store:fo_stores!fo_interstore_transfers_to_store_id_fkey(id, store_code, name),
       lines:fo_interstore_transfer_lines(
         id, product_id, quantity, unit_cost,
         product:fo_products(id, product_code, style_code, color_code, category, product_line, brand_id,
           brand:fo_brands(name))
       )`
    )
    .order('document_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // HQ 가 아니면 본인 매장 관련 (보내는 또는 받는) 만 노출
  if (!isHqRole(session.role_code)) {
    q = q.or(`from_store_id.eq.${session.store_id},to_store_id.eq.${session.store_id}`);
  }
  if (fromStoreId) q = q.eq('from_store_id', fromStoreId);
  if (toStoreId) q = q.eq('to_store_id', toStoreId);
  if (dateFrom) q = q.gte('document_at', dateFrom);
  if (dateTo) q = q.lte('document_at', `${dateTo}T23:59:59`);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  let transfers = (data ?? []) as unknown as Array<{
    id: string;
    document_at: string;
    note: string | null;
    status: string;
    created_at: string;
    decided_at: string | null;
    from_store_id: string;
    to_store_id: string;
    from_store: { id: string; store_code: string; name: string } | null;
    to_store: { id: string; store_code: string; name: string } | null;
    lines: Array<{
      id: string;
      product_id: string;
      quantity: number;
      unit_cost: number;
      product: {
        id: string;
        product_code: string | null;
        style_code: string | null;
        color_code: string | null;
        category: string | null;
        product_line: string | null;
        brand_id: string | null;
        brand: { name: string | null } | null;
      } | null;
    }>;
  }>;

  // 상품 검색 (라인 매칭 시 transfer 통과)
  if (productQuery) {
    const lcq = productQuery.toLowerCase();
    transfers = transfers.filter((t) =>
      (t.lines ?? []).some((l) => {
        const p = l.product;
        if (!p) return false;
        return (
          (p.product_code ?? '').toLowerCase().includes(lcq) ||
          (p.style_code ?? '').toLowerCase().includes(lcq) ||
          (p.color_code ?? '').toLowerCase().includes(lcq)
        );
      })
    );
  }

  return NextResponse.json({ data: transfers, error: null });
}

// ── POST: 새 점간이동 생성 ──────────────────────────────────────────────────
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json(
      { data: null, error: '점간이동 권한이 없습니다.' },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as CreateBody;

    if (!body.from_store_id || !body.to_store_id) {
      return NextResponse.json(
        { data: null, error: '보내는 매장과 받는 매장을 모두 선택해야 합니다.' },
        { status: 400 }
      );
    }
    if (body.from_store_id === body.to_store_id) {
      return NextResponse.json(
        { data: null, error: '보내는 매장과 받는 매장은 달라야 합니다.' },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { data: null, error: '이동 항목은 최소 1개 이상 필요합니다.' },
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

    // 지점 매니저는 본인 매장에서만 출고 가능
    if (!isHqRole(session.role_code) && body.from_store_id !== session.store_id) {
      return NextResponse.json(
        { data: null, error: '본인 매장에서만 출고할 수 있습니다.' },
        { status: 403 }
      );
    }

    const db = getDB();
    const docAt = body.document_at ?? new Date().toISOString();

    // 1) 헤더 INSERT
    const { data: receipt, error: hErr } = await db
      .from('fo_interstore_transfers')
      .insert({
        from_store_id: body.from_store_id,
        to_store_id: body.to_store_id,
        document_at: docAt,
        note: body.note ?? null,
        status: 'pending',
      })
      .select('id, document_at, status')
      .single();
    if (hErr || !receipt) {
      return NextResponse.json(
        { data: null, error: hErr?.message ?? '전표 생성 실패' },
        { status: 500 }
      );
    }

    // 2) 라인 INSERT (unit_cost 미지정 시 fo_products.cost_price 적용)
    const productIds = Array.from(new Set(body.lines.map((l) => l.product_id)));
    const { data: prodMeta } = await db
      .from('fo_products')
      .select('id, cost_price')
      .in('id', productIds);
    const costMap = new Map((prodMeta ?? []).map((p) => [p.id, p.cost_price ?? 0]));

    const linesPayload = body.lines.map((l) => ({
      transfer_id: receipt.id,
      product_id: l.product_id,
      quantity: Math.floor(l.quantity),
      unit_cost: l.unit_cost ?? costMap.get(l.product_id) ?? 0,
    }));

    const { error: lErr } = await db
      .from('fo_interstore_transfer_lines')
      .insert(linesPayload);
    if (lErr) {
      // 헤더 롤백 (best-effort)
      await db.from('fo_interstore_transfers').delete().eq('id', receipt.id);
      return NextResponse.json({ data: null, error: lErr.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id: receipt.id,
        document_at: receipt.document_at,
        status: receipt.status,
        lines_created: linesPayload.length,
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
