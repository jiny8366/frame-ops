// Frame Ops Web — /api/admin/settlement
// GET ?date=YYYY-MM-DD  → 일일 마감 요약 (매출/지출/시재/기존 정산)
// POST                  → 정산 마감 저장 (UPSERT + 지출 라인 교체)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';

interface ExpenseLine {
  amount: number;
  memo?: string | null;
  sort_order?: number;
}

interface CloseBody {
  business_date: string; // YYYY-MM-DD
  cash_counted: number;
  deposit?: number;
  note?: string | null;
  expenses?: ExpenseLine[];
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date') || todayDate();

  const db = getDB();
  const { data: summary, error } = await db.rpc('get_daily_settlement_summary', {
    p_store_id: session.store_id,
    p_business_date: date,
  });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  let expenses: Array<{ id: string; amount: number; memo: string | null; sort_order: number }> = [];
  const settlement = summary?.[0];
  if (settlement?.settlement_id) {
    const { data: rows } = await db
      .from('fo_settlement_expenses')
      .select('id, amount, memo, sort_order')
      .eq('settlement_id', settlement.settlement_id)
      .order('sort_order', { ascending: true });
    expenses = rows ?? [];
  }

  return NextResponse.json({
    data: {
      business_date: date,
      ...(settlement ?? null),
      expenses,
    },
    error: null,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CloseBody;

    if (!body.business_date) {
      return NextResponse.json(
        { data: null, error: 'business_date 가 필요합니다.' },
        { status: 400 }
      );
    }
    if (typeof body.cash_counted !== 'number' || body.cash_counted < 0) {
      return NextResponse.json(
        { data: null, error: '실측 현금 (cash_counted) 은 0 이상의 숫자여야 합니다.' },
        { status: 400 }
      );
    }

    const db = getDB();

    // 이미 마감된 영업일은 수정 불가
    const { data: existing } = await db
      .from('fo_settlements')
      .select('id')
      .eq('store_id', session.store_id)
      .eq('business_date', body.business_date)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { data: null, error: '이미 마감된 영업일입니다. 수정할 수 없습니다.' },
        { status: 409 }
      );
    }

    const { data, error } = await db.rpc('close_daily_settlement', {
      p_store_id: session.store_id,
      p_business_date: body.business_date,
      p_cash_counted: Math.round(body.cash_counted),
      p_deposit: Math.round(body.deposit ?? 0),
      p_note: body.note ?? null,
      p_expenses: (body.expenses ?? []) as unknown as never,
    });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data?.[0] ?? null, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
