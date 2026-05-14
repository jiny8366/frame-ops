// Frame Ops Web — /api/inventory/audits
// GET: 재고조사 이력 목록 (현재 매장 + 본사 권한자는 전체).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { isHqRole } from '@/lib/auth/permissions';

interface AuditRow {
  id: string;
  store_id: string;
  store_code: string | null;
  store_name: string | null;
  audit_date: string;
  uploaded_at: string;
  applied_at: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  note: string | null;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const queryStoreId = url.searchParams.get('store_id');
    const db = getDB();
    // fo_stock_audits 는 generated Database types 에 아직 없음 → untyped 클라이언트로 캐스팅
    const dbAny = db as unknown as import('@supabase/supabase-js').SupabaseClient;

    let q = dbAny
      .from('fo_stock_audits')
      .select(
        `id, store_id, audit_date, uploaded_at, applied_at, status, total_lines, matched_lines, note,
         store:fo_stores(store_code, name)`
      )
      .order('uploaded_at', { ascending: false })
      .limit(50);

    // 본사 권한이면 전체, 매장 staff 이면 자기 매장만
    const isHq = isHqRole(session.role_code);
    if (!isHq) {
      q = q.eq('store_id', session.store_id);
    } else if (queryStoreId) {
      q = q.eq('store_id', queryStoreId);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    type Row = {
      id: string;
      store_id: string;
      audit_date: string;
      uploaded_at: string;
      applied_at: string | null;
      status: string;
      total_lines: number;
      matched_lines: number;
      note: string | null;
      store: { store_code: string | null; name: string | null } | { store_code: string | null; name: string | null }[] | null;
    };

    const rows: AuditRow[] = ((data ?? []) as unknown as Row[]).map((r) => {
      const s = Array.isArray(r.store) ? r.store[0] : r.store;
      return {
        id: r.id,
        store_id: r.store_id,
        store_code: s?.store_code ?? null,
        store_name: s?.name ?? null,
        audit_date: r.audit_date,
        uploaded_at: r.uploaded_at,
        applied_at: r.applied_at,
        status: r.status,
        total_lines: r.total_lines,
        matched_lines: r.matched_lines,
        note: r.note,
      };
    });

    return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
