// Frame Ops Web — /api/admin/transfers/[id]/reject
// 받는 매장이 점간이동을 반려. 재고/매입 변동 없음 — 상태만 'rejected' 로 변경.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

export async function POST(
  request: Request,
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

  let rejectNote: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { reject_note?: string };
    rejectNote = body.reject_note?.trim() || null;
  } catch {
    /* 본문 없음 OK */
  }

  const db = getDB();
  const { data: r } = await db
    .from('fo_interstore_transfers')
    .select('id, status, to_store_id')
    .eq('id', id)
    .maybeSingle();
  if (!r) {
    return NextResponse.json({ data: null, error: '전표를 찾을 수 없습니다.' }, { status: 404 });
  }
  const isHq = session.role_code.startsWith('hq_');
  if (!isHq && r.to_store_id !== session.store_id) {
    return NextResponse.json(
      { data: null, error: '받는 매장만 반려할 수 있습니다.' },
      { status: 403 }
    );
  }
  if (r.status !== 'pending') {
    return NextResponse.json(
      { data: null, error: `이미 처리된 전표입니다 (상태: ${r.status}).` },
      { status: 409 }
    );
  }

  const { error: uErr } = await db
    .from('fo_interstore_transfers')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
      reject_note: rejectNote,
    })
    .eq('id', id);
  if (uErr) {
    return NextResponse.json({ data: null, error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: { id, status: 'rejected' }, error: null });
}
