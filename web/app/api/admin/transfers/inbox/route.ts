// Frame Ops Web — /api/admin/transfers/inbox
// 현재 사용자에게 도착한 미처리 점간이동 전표 (status='pending', to_store_id=session.store).
// HQ 사용자는 모든 pending 전표 반환.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission } from '@/lib/auth/permissions';

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(session.permissions, 'interstore_transfer')) {
    return NextResponse.json({ data: [], error: null });
  }

  const db = getDB();
  let q = db
    .from('fo_interstore_transfers')
    .select(
      `id, document_at, note, status, created_at,
       from_store_id, to_store_id,
       from_store:fo_stores!fo_interstore_transfers_from_store_id_fkey(id, store_code, name),
       to_store:fo_stores!fo_interstore_transfers_to_store_id_fkey(id, store_code, name),
       lines:fo_interstore_transfer_lines(
         id, product_id, quantity, unit_cost,
         product:fo_products(id, style_code, color_code, category, product_line,
           brand:fo_brands(name))
       )`
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!session.role_code.startsWith('hq_')) {
    q = q.eq('to_store_id', session.store_id);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], error: null });
}
