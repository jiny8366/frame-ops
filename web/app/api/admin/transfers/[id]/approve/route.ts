// Frame Ops Web — /api/admin/transfers/[id]/approve
// 받는 매장이 점간이동을 승인. 매입 전표(보내는 매장 = 매입처)를 자동 생성하여
// 재고를 받는 매장에 반영하고, 보내는 매장의 fo_products.stock_quantity 는 차감(best-effort).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

const TRANSFER_SUPPLIER_MEMO_PREFIX = 'transfer:from_store:';

async function findOrCreateTransferSupplier(
  fromStoreId: string,
  storeCode: string | null,
  storeName: string
) {
  const db = getDB();
  const memoTag = `${TRANSFER_SUPPLIER_MEMO_PREFIX}${fromStoreId}`;
  // 1) 기존 supplier 조회
  const { data: existing } = await db
    .from('fo_suppliers')
    .select('id')
    .eq('memo', memoTag)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  // 2) 없으면 새로 생성
  const { data: created, error } = await db
    .from('fo_suppliers')
    .insert({
      name: storeName,
      supplier_code: storeCode ?? null,
      memo: memoTag,
      active: true,
    })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(`매입처(보내는 매장) 생성 실패: ${error?.message}`);
  }
  return created.id;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 });
  }
  const { id } = await params;
  const db = getDB();

  // 1) 전표 + 라인 + 매장 정보 로드
  const { data: receipt, error: rErr } = await db
    .from('fo_interstore_transfers')
    .select(
      `id, document_at, note, status, from_store_id, to_store_id,
       from_store:fo_stores!fo_interstore_transfers_from_store_id_fkey(store_code, name),
       lines:fo_interstore_transfer_lines(id, product_id, quantity, unit_cost)`
    )
    .eq('id', id)
    .maybeSingle();
  if (rErr || !receipt) {
    return NextResponse.json(
      { data: null, error: rErr?.message ?? '전표를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }
  const r = receipt as unknown as {
    id: string;
    document_at: string;
    note: string | null;
    status: string;
    from_store_id: string;
    to_store_id: string;
    from_store: { store_code: string | null; name: string } | null;
    lines: Array<{ id: string; product_id: string; quantity: number; unit_cost: number }>;
  };

  // 2) 권한 체크 — HQ 또는 받는 매장 사용자
  const isHq = session.role_code.startsWith('hq_');
  if (!isHq && r.to_store_id !== session.store_id) {
    return NextResponse.json(
      { data: null, error: '받는 매장만 승인할 수 있습니다.' },
      { status: 403 }
    );
  }

  // 3) 상태 체크
  if (r.status !== 'pending') {
    return NextResponse.json(
      { data: null, error: `이미 처리된 전표입니다 (상태: ${r.status}).` },
      { status: 409 }
    );
  }

  if (!r.lines || r.lines.length === 0) {
    return NextResponse.json(
      { data: null, error: '라인이 없는 전표는 승인할 수 없습니다.' },
      { status: 400 }
    );
  }

  try {
    // 4) 보내는 매장을 매입처로 매핑 (없으면 자동 생성)
    const supplierId = await findOrCreateTransferSupplier(
      r.from_store_id,
      r.from_store?.store_code ?? null,
      r.from_store?.name ?? '점간이동(자동)'
    );

    // 5) 받는 매장에 매입 등록 (RPC — 재고 자동 증가 처리)
    const { data: inboundResult, error: iErr } = await db.rpc('create_inbound_receipt', {
      p_store_id: r.to_store_id,
      p_supplier_id: supplierId,
      p_document_at: r.document_at,
      p_note: `[점간이동] ${r.from_store?.name ?? ''} → 승인 #${r.id.slice(0, 8)}`,
      p_lines: r.lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      })) as unknown as never,
    });
    if (iErr) {
      return NextResponse.json(
        { data: null, error: `매입 등록 실패: ${iErr.message}` },
        { status: 500 }
      );
    }
    const receiptId = (inboundResult as Array<{ receipt_id: string }> | null)?.[0]?.receipt_id ?? null;

    // 6) 보내는 매장 stock_quantity 차감 (best-effort, 트랜잭션 보장 X)
    for (const l of r.lines) {
      const { data: prod } = await db
        .from('fo_products')
        .select('stock_quantity')
        .eq('id', l.product_id)
        .maybeSingle();
      const cur = prod?.stock_quantity ?? 0;
      await db
        .from('fo_products')
        .update({ stock_quantity: Math.max(0, cur - l.quantity) })
        .eq('id', l.product_id);
    }

    // 7) 전표 상태 업데이트
    const { error: uErr } = await db
      .from('fo_interstore_transfers')
      .update({
        status: 'approved',
        decided_at: new Date().toISOString(),
        hold_note: receiptId ? `inbound_receipt:${receiptId}` : null,
      })
      .eq('id', id);
    if (uErr) {
      return NextResponse.json({ data: null, error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        id,
        status: 'approved',
        inbound_receipt_id: receiptId,
        lines_processed: r.lines.length,
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
