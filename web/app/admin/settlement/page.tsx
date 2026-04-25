// Frame Ops Web — 정산
// 좌측: 영업일자 기준 매출/지출/시재/본사입금 + 마감 저장 폼.
// 우측: 당월 일자별 매출/현금/카드/건수/지출 리스트 (누계 포함) + 상단 당월 합계.

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useSession } from '@/hooks/useSession';
import { hasPermission, isHqRole } from '@/lib/auth/permissions';

interface ExpenseLine {
  id?: string;
  amount: number;
  memo: string;
  sort_order: number;
}

interface SummaryResponse {
  business_date: string;
  settlement_id: string | null;
  starting_cash: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_expense: number;
  cash_counted: number | null;
  cash_expected: number | null;
  variance: number | null;
  deposit: number;
  cash_on_hand: number;
  note: string | null;
  is_closed: boolean;
  expenses: ExpenseLine[];
}

interface MonthlyDay {
  business_date: string;
  sales_amount: number;
  cash_amount: number;
  card_amount: number;
  sales_count: number;
  expense: number;
}

interface MonthlyResponse {
  year_month: string;
  days: MonthlyDay[];
}

function makeFetcher<T>() {
  return async (url: string): Promise<T> => {
    const res = await fetch(url);
    const json = (await res.json()) as { data: T | null; error: string | null };
    if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
    return json.data;
  };
}
const summaryFetcher = makeFetcher<SummaryResponse>();
const monthlyFetcher = makeFetcher<MonthlyResponse>();

// 서버(한국 영업일자) 기준 오늘 — Asia/Seoul 캘린더 일자 반환.
function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function ymOf(date: string): string {
  return date.slice(0, 7);
}

function fmtMD(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z'); // UTC 자정 기준 단순 산술 — 결과는 다시 YYYY-MM-DD 로 잘라냄
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SettlementPage() {
  const { session } = useSession();
  const canUnlock =
    !!session && isHqRole(session.role_code) && hasPermission(session.permissions, 'settlement_edit_locked');

  const [date, setDate] = useState<string>(todayDate());
  const ym = ymOf(date);

  const { data, isLoading, mutate } = useSWR<SummaryResponse>(
    `/api/admin/settlement?date=${date}`,
    summaryFetcher
  );
  const { data: monthly, mutate: mutateMonthly } = useSWR<MonthlyResponse>(
    `/api/admin/settlement/monthly?ym=${ym}`,
    monthlyFetcher
  );

  // 입력 가능 필드
  const [cashCounted, setCashCounted] = useState<number>(0);
  const [deposit, setDeposit] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [expenses, setExpenses] = useState<ExpenseLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setCashCounted(data.cash_counted ?? data.total_cash_sales + data.starting_cash - data.total_expense);
    setDeposit(data.deposit ?? 0);
    setNote(data.note ?? '');
    setExpenses(
      data.expenses && data.expenses.length > 0
        ? data.expenses.map((e) => ({ ...e, memo: e.memo ?? '' }))
        : []
    );
  }, [data]);

  const localExpenseTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const expectedCash = useMemo(() => {
    if (!data) return 0;
    return data.starting_cash + data.total_cash_sales - localExpenseTotal - (deposit || 0);
  }, [data, localExpenseTotal, deposit]);

  const variance = useMemo(() => cashCounted - expectedCash, [cashCounted, expectedCash]);

  const isClosed = !!data?.is_closed;
  const isLocked = isClosed && !canUnlock;

  const handleAddExpense = useCallback(() => {
    setExpenses((prev) => [
      ...prev,
      { amount: 0, memo: '', sort_order: prev.length },
    ]);
  }, []);

  const handleExpenseChange = useCallback((idx: number, field: 'amount' | 'memo', value: string | number) => {
    setExpenses((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const handleRemoveExpense = useCallback((idx: number) => {
    setExpenses((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/settlement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_date: date,
            cash_counted: cashCounted,
            deposit,
            note: note || null,
            expenses: expenses
              .filter((e) => e.amount > 0)
              .map((e, i) => ({ amount: e.amount, memo: e.memo || null, sort_order: i })),
          }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          toast.error(json.error ?? '저장 실패');
          setSubmitting(false);
          return;
        }
        toast.success('정산 저장 완료');
        // 마감 후: 다음 영업일로 이동(오늘 초과 시 오늘로 클램프). 같은 날이면 명시 refresh.
        const nextDate = addDays(date, 1);
        const today = todayDate();
        const newDate = nextDate > today ? today : nextDate;
        if (newDate !== date) {
          setDate(newDate); // SWR 가 새 키로 재요청
        } else {
          await mutate();
        }
        await mutateMonthly();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '네트워크 오류');
      } finally {
        setSubmitting(false);
      }
    },
    [date, cashCounted, deposit, note, expenses, submitting, mutate, mutateMonthly]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,720px)_minmax(0,1fr)] gap-4 xl:gap-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 min-w-0">
          <header className="flex items-center justify-between flex-wrap gap-2">
            <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">정산</h1>
            <label className="flex items-center gap-2">
              <span className="text-caption1 text-[var(--color-label-secondary)]">영업일자</span>
              <input
                type="date"
                value={date}
                max={todayDate()}
                onChange={(e) => setDate(e.target.value || todayDate())}
                className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-secondary)] px-2 py-1 text-callout tabular-nums"
              />
            </label>
          </header>

          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : !data ? (
            <p className="text-callout text-[var(--color-system-red)] text-center py-12">
              요약을 불러올 수 없습니다.
            </p>
          ) : (
            <>
              <Card title="매출 (자동 집계)">
                <Row label="현금 매출" value={data.total_cash_sales} />
                <Row label="카드 매출" value={data.total_card_sales} />
                <Row
                  label="매출 합계"
                  value={data.total_cash_sales + data.total_card_sales}
                  bold
                />
              </Card>

              <Card
                title="지출 내역"
                right={
                  !isLocked && (
                    <button
                      type="button"
                      onClick={handleAddExpense}
                      className="pressable text-caption1 text-[var(--color-system-blue)] font-medium"
                    >
                      + 지출 추가
                    </button>
                  )
                }
              >
                {expenses.length === 0 ? (
                  <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-3">
                    지출 항목이 없습니다.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {expenses.map((e, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={e.memo}
                          onChange={(ev) => handleExpenseChange(idx, 'memo', ev.target.value)}
                          placeholder="비고 (예: 공과금, 식대)"
                          disabled={isLocked}
                          readOnly={isLocked}
                          className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout disabled:opacity-60"
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1000}
                          value={e.amount || ''}
                          onChange={(ev) => handleExpenseChange(idx, 'amount', Number(ev.target.value) || 0)}
                          placeholder="0"
                          disabled={isLocked}
                          readOnly={isLocked}
                          className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums disabled:opacity-60"
                        />
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExpense(idx)}
                            aria-label="삭제"
                            className="pressable text-[var(--color-system-red)]"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <Row label="지출 합계" value={localExpenseTotal} bold />
                  </div>
                )}
              </Card>

              <Card title="현금 마감">
                <Row label="시작 시재 (전일 잔액)" value={data.starting_cash} sub />
                <Row label="+ 현금 매출" value={data.total_cash_sales} sub />
                <Row label="− 지출" value={localExpenseTotal} sub negative />
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-callout text-[var(--color-label-secondary)]">− 본사 입금</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={deposit || ''}
                    onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                    placeholder="0"
                    disabled={isLocked}
                    readOnly={isLocked}
                    className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums disabled:opacity-60"
                  />
                </div>
                <div className="border-t border-[var(--color-separator-opaque)] my-1" />
                <Row label="예상 현금" value={expectedCash} bold />
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-callout text-[var(--color-label-primary)] font-semibold">실측 현금</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1000}
                    value={cashCounted || ''}
                    onChange={(e) => setCashCounted(Number(e.target.value) || 0)}
                    placeholder="0"
                    disabled={isLocked}
                    readOnly={isLocked}
                    className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums font-semibold disabled:opacity-60"
                  />
                </div>
                <Row
                  label="차액"
                  value={variance}
                  bold
                  color={variance === 0 ? 'green' : variance < 0 ? 'red' : 'orange'}
                />
              </Card>

              <Card title="비고">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="선택 입력"
                  rows={2}
                  disabled={isLocked}
                  readOnly={isLocked}
                  className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout disabled:opacity-60"
                />
              </Card>

              {!isLocked && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
                >
                  {submitting ? '저장 중…' : isClosed ? '마감 갱신 (본사 권한)' : '정산 저장'}
                </button>
              )}
            </>
          )}
        </form>

        <MonthlyPanel ym={ym} monthly={monthly} selectedDate={date} onPick={setDate} />
      </div>
    </main>
  );
}

function MonthlyPanel({
  ym,
  monthly,
  selectedDate,
  onPick,
}: {
  ym: string;
  monthly: MonthlyResponse | undefined;
  selectedDate: string;
  onPick: (date: string) => void;
}) {
  // 누계(running total) + 당월 합계 — 일자 오름차순 기준
  const { rows, totals } = useMemo(() => {
    const days = monthly?.days ?? [];
    let salesAcc = 0;
    let cashAcc = 0;
    let cardAcc = 0;
    let countAcc = 0;
    let expenseAcc = 0;
    const rows = days.map((d) => {
      salesAcc += d.sales_amount;
      cashAcc += d.cash_amount;
      cardAcc += d.card_amount;
      countAcc += d.sales_count;
      expenseAcc += d.expense;
      return {
        ...d,
        sales_acc: salesAcc,
        cash_acc: cashAcc,
        card_acc: cardAcc,
        count_acc: countAcc,
        expense_acc: expenseAcc,
      };
    });
    return {
      rows,
      totals: {
        sales: salesAcc,
        cash: cashAcc,
        card: cardAcc,
        count: countAcc,
        expense: expenseAcc,
      },
    };
  }, [monthly]);

  return (
    <aside className="flex flex-col gap-3 min-w-0">
      <header>
        <h2 className="text-title3 font-bold text-[var(--color-label-primary)]">
          {ym.replace('-', '. ')} 정산내역
        </h2>
        <p className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
          행을 더블클릭하면 좌측에 해당 영업일 상세가 로드됩니다.
        </p>
      </header>

      {/* 당월 합계 */}
      <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="매출누계" value={totals.sales} />
        <Stat label="현금누계" value={totals.cash} />
        <Stat label="카드누계" value={totals.card} />
        <Stat label="건수누계" value={totals.count} suffix="건" />
        <Stat label="지출누계" value={totals.expense} />
      </section>

      {/* 일자별 리스트 */}
      <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            당월 정산 내역이 없습니다.
          </p>
        ) : (
          <div className="overflow-auto max-h-[720px]">
            <table className="w-full text-caption1">
              <thead className="bg-[var(--color-fill-quaternary)] text-caption2 text-[var(--color-label-secondary)] sticky top-0">
                <tr>
                  <th className="text-left p-2 whitespace-nowrap">날짜</th>
                  <th className="text-right p-2 whitespace-nowrap">매출누계</th>
                  <th className="text-right p-2 whitespace-nowrap">매출</th>
                  <th className="text-right p-2 whitespace-nowrap">현금누계</th>
                  <th className="text-right p-2 whitespace-nowrap">현금</th>
                  <th className="text-right p-2 whitespace-nowrap">카드누계</th>
                  <th className="text-right p-2 whitespace-nowrap">카드</th>
                  <th className="text-right p-2 whitespace-nowrap">건수</th>
                  <th className="text-right p-2 whitespace-nowrap">지출누계</th>
                  <th className="text-right p-2 whitespace-nowrap">지출</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.business_date}
                    onDoubleClick={() => onPick(r.business_date)}
                    title="더블클릭으로 좌측 상세에 로드"
                    aria-selected={r.business_date === selectedDate}
                    className={
                      'cursor-pointer border-t border-[var(--color-separator-opaque)] tabular-nums select-none ' +
                      (r.business_date === selectedDate
                        ? 'bg-[var(--color-system-blue)]/10'
                        : 'hover:bg-[var(--color-fill-quaternary)]')
                    }
                  >
                    <td className="p-2 whitespace-nowrap font-mono">{fmtMD(r.business_date)}</td>
                    <td className="p-2 text-right font-semibold">{r.sales_acc.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.sales_amount.toLocaleString()}</td>
                    <td className="p-2 text-right text-[var(--color-label-secondary)]">{r.cash_acc.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.cash_amount.toLocaleString()}</td>
                    <td className="p-2 text-right text-[var(--color-label-secondary)]">{r.card_acc.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.card_amount.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.sales_count.toLocaleString()}</td>
                    <td className="p-2 text-right text-[var(--color-label-secondary)]">{r.expense_acc.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.expense.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </aside>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption2 text-[var(--color-label-tertiary)]">{label}</span>
      <span className="text-headline font-semibold tabular-nums text-[var(--color-label-primary)]">
        {value.toLocaleString()}
        {suffix ? <span className="ml-0.5 text-caption1 text-[var(--color-label-secondary)] font-normal">{suffix}</span> : null}
      </span>
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">{title}</h2>
        {right}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  sub,
  negative,
  color,
}: {
  label: string;
  value: number;
  bold?: boolean;
  sub?: boolean;
  negative?: boolean;
  color?: 'green' | 'red' | 'orange';
}) {
  const base = 'flex items-baseline justify-between py-1.5';
  const labelClass = sub
    ? 'text-callout text-[var(--color-label-secondary)]'
    : 'text-callout text-[var(--color-label-primary)]' + (bold ? ' font-semibold' : '');
  const valColorVar =
    color === 'green'
      ? 'var(--color-system-green)'
      : color === 'red'
        ? 'var(--color-system-red)'
        : color === 'orange'
          ? 'var(--color-system-orange)'
          : 'var(--color-label-primary)';
  const valClass = `text-callout tabular-nums${bold ? ' font-semibold' : ''}`;
  const display = `${negative ? '−' : ''}₩${Math.abs(value).toLocaleString()}`;
  return (
    <div className={base}>
      <span className={labelClass}>{label}</span>
      <span className={valClass} style={{ color: valColorVar }}>
        {value < 0 && !negative ? '−' : ''}
        {value < 0 && !negative ? `₩${Math.abs(value).toLocaleString()}` : display}
      </span>
    </div>
  );
}
