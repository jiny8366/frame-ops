// Frame Ops Web — /api/admin/sales-search
// GET ?from=&to=&q=  → 판매 행 + 담당자명 + 항목 요약

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

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const query = url.searchParams.get('q') || null;
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500);

  const db = getDB();
  const { data, error } = await db.rpc('search_sales', {
    p_store_id: session.store_id,
    p_from: from,
    p_to: to,
    p_query: query,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [], error: null });
}
