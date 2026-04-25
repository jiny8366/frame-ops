// Frame Ops Web — /api/admin/stats
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → 기간 합계 + 월누적 + Top 상품 리스트

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || todayDate();
  const to = url.searchParams.get('to') || todayDate();
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  const db = getDB();
  const [statsRes, topRes] = await Promise.all([
    db.rpc('get_sales_stats', { p_store_id: session.store_id, p_from: from, p_to: to }),
    db.rpc('get_top_products', {
      p_store_id: session.store_id,
      p_from: from,
      p_to: to,
      p_limit: limit,
    }),
  ]);

  if (statsRes.error) {
    return NextResponse.json({ data: null, error: statsRes.error.message }, { status: 500 });
  }
  if (topRes.error) {
    return NextResponse.json({ data: null, error: topRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      period: { from, to },
      summary: statsRes.data?.[0] ?? null,
      top_products: topRes.data ?? [],
    },
    error: null,
  });
}
