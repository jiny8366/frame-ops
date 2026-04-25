// Frame Ops Web — /api/admin/settlement/monthly?ym=YYYY-MM
// 정산 페이지 우측 리스트용 — 당월 일자별 매출/현금/카드/건수/지출.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface DayRow {
  business_date: string;
  sales_amount: number;
  cash_amount: number;
  card_amount: number;
  sales_count: number;
  expense: number;
}

function thisYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const ym = url.searchParams.get('ym') || thisYearMonth();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    return NextResponse.json(
      { data: null, error: 'ym 형식은 YYYY-MM 이어야 합니다.' },
      { status: 400 }
    );
  }

  const db = getDB();
  // RPC 타입 자동 생성 전 — typed-rpc 우회
  const { data, error } = await (db.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: DayRow[] | null; error: { message: string } | null }>)(
    'get_monthly_settlement_list',
    { p_store_id: session.store_id, p_year_month: ym }
  );

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: { year_month: ym, days: data ?? [] },
    error: null,
  });
}
