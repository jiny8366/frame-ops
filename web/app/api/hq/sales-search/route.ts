// Frame Ops Web — /api/hq/sales-search
// GET ?from=&to=&q=&store_id=&limit= → 본사 판매내역 검색 (매장 정보 포함)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
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
  const q = url.searchParams.get('q') || null;
  const storeId = url.searchParams.get('store_id') || null;
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500);

  const db = getDB();
  const { data, error } = await (db.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>)(
    'search_hq_sales',
    { p_from: from, p_to: to, p_query: q, p_store_id: storeId, p_limit: limit }
  );

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 매장 옵션
  const { data: stores } = await db
    .from('fo_stores')
    .select('id, store_code, name, active')
    .eq('active', true)
    .order('store_code', { ascending: true });

  return NextResponse.json({
    data: { rows: data ?? [], stores: stores ?? [] },
    error: null,
  });
}
