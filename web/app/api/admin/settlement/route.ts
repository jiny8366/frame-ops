// Frame Ops Web — /api/admin/settlement
// GET ?date=YYYY-MM-DD  → 일일 마감 요약 (매출/지출/시재/기존 정산)
// POST                  → 정산 마감 저장 (UPSERT + 지출 라인 교체)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import { fetchReturnsTotals } from '@/lib/sales-returns';

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

// 서버 기준 한국 영업일자 — RPC 일자 버킷팅(Asia/Seoul)과 일치.
function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
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

  // 환불 보정 — RPC 가 fo_returns 를 미반영하므로 클라이언트 측에서 차감 후 반환.
  const returns = await fetchReturnsTotals(db, date, date, session.store_id);
  const settlementAdjusted = settlement
    ? {
        ...settlement,
        // 결제수단별 매출에서 환불액 차감
        total_cash_sales: (settlement.total_cash_sales ?? 0) - returns.cashRefund,
        total_card_sales: (settlement.total_card_sales ?? 0) - returns.cardRefund,
        // 시재 기대값 = (현금매출 - 환불 현금) - 지출 + 시작 시재
        cash_expected:
          (settlement.cash_expected ?? 0) - returns.cashRefund,
        variance:
          settlement.cash_counted != null
            ? settlement.cash_counted - ((settlement.cash_expected ?? 0) - returns.cashRefund)
            : settlement.variance,
      }
    : null;

  return NextResponse.json({
    data: {
      business_date: date,
      ...(settlementAdjusted ?? settlement ?? null),
      expenses,
      // 환불 명세 (UI 에서 별도 표시 가능)
      returns_summary: {
        count: returns.count,
        items: returns.itemsCount,
        qty: returns.qty,
        amount: returns.amount,
        cash_refund: returns.cashRefund,
        card_refund: returns.cardRefund,
      },
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

    // 이미 마감된 영업일은 본사 전용 권한 보유자만 수정 가능
    const canUnlock =
      session.role_code.startsWith('hq_') &&
      Array.isArray(session.permissions) &&
      session.permissions.includes('settlement_edit_locked');
    const { data: existing } = await db
      .from('fo_settlements')
      .select('id')
      .eq('store_id', session.store_id)
      .eq('business_date', body.business_date)
      .maybeSingle();
    if (existing && !canUnlock) {
      return NextResponse.json(
        { data: null, error: '이미 마감된 영업일입니다. 수정 권한이 없습니다.' },
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
