// Frame Ops Web — /api/inventory/audits/[id]/apply (POST)
// 재고조사 적용 확정. RPC apply_stock_audit 호출.
// audit_date 이후 거래량을 보정하여 fo_stock + fo_products.stock_quantity 갱신.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface ApplyResult {
  audit_id: string;
  applied_lines: number;
  skipped_lines: number;
  total_quantity: number;
}

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const { id } = await ctx.params;

    const db = getDB();
    const { data, error } = await (db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: ApplyResult[] | null; error: { message: string } | null }>)(
      'apply_stock_audit',
      { p_audit_id: id }
    );
    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    const row = (data as ApplyResult[] | null)?.[0] ?? null;
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
