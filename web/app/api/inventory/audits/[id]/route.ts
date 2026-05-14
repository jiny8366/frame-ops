// Frame Ops Web — /api/inventory/audits/[id]
// GET: 미리보기 재계산 + 헤더 정보.
// DELETE: draft 상태인 audit 삭제 (취소).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface PreviewRow {
  line_id: string;
  product_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  current_stock: number;
  counted_quantity: number;
  delta_after_audit: number;
  applied_quantity: number;
  match_status: 'matched' | 'unmatched' | 'skipped';
}

export async function GET(
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

    // fo_stock_audits / fo_stock_audit_lines 는 generated types 에 아직 없어 casting 사용
    // fo_stock_audits / fo_stock_audit_lines 는 generated Database types 에 아직 없음 → untyped 클라이언트로 캐스팅
    const dbAny = db as unknown as import('@supabase/supabase-js').SupabaseClient;
    const [{ data: header, error: hErr }, { data: prev, error: pErr }, { data: unmatchedLines }] =
      await Promise.all([
        dbAny
          .from('fo_stock_audits')
          .select('id, store_id, audit_date, uploaded_at, applied_at, status, total_lines, matched_lines, note')
          .eq('id', id)
          .single(),
        (db.rpc as unknown as (
          name: string,
          args: Record<string, unknown>
        ) => Promise<{ data: PreviewRow[] | null; error: { message: string } | null }>)(
          'preview_stock_audit',
          { p_audit_id: id }
        ),
        dbAny
          .from('fo_stock_audit_lines')
          .select('id, raw_brand, raw_style_code, raw_color_code, counted_quantity, match_status')
          .eq('audit_id', id)
          .eq('match_status', 'unmatched'),
      ]);

    if (hErr || !header) {
      return NextResponse.json(
        { data: null, error: hErr?.message ?? '재고조사 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    if (pErr) {
      return NextResponse.json({ data: null, error: pErr.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        header,
        preview: (prev ?? []) as PreviewRow[],
        unmatched: unmatchedLines ?? [],
      },
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}

export async function DELETE(
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

    // fo_stock_audits / fo_stock_audit_lines 는 generated Database types 에 아직 없음 → untyped 클라이언트로 캐스팅
    const dbAny = db as unknown as import('@supabase/supabase-js').SupabaseClient;
    // draft 만 삭제 — applied 는 이미 fo_stock 에 반영되었으므로 보존
    const { data: header } = await dbAny
      .from('fo_stock_audits')
      .select('status')
      .eq('id', id)
      .single();
    if (header?.status === 'applied') {
      return NextResponse.json(
        { data: null, error: '이미 적용된 재고조사는 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    const { error } = await dbAny.from('fo_stock_audits').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
