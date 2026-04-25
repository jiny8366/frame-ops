// Frame Ops Web — 일일 마감
// 영업일자 기준: 매출 자동 집계 + 지출 라인 입력 + 시재 계산 + 본사 입금 + 실측 현금 → 마감 저장.

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';

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

const fetcher = async (url: string): Promise<SummaryResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: SummaryResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SettlementPage() {
  const [date, setDate] = useState<string>(todayDate());
  const { data, isLoading, mutate } = useSWR<SummaryResponse>(
    `/api/admin/settlement?date=${date}`,
    fetcher
  );

  // 입력 가능 필드
  const [cashCounted, setCashCounted] = useState<number>(0);
  const [deposit, setDeposit] = useState<number>(0);
  const [note, setNote] = useState<string>('');
  const [expenses, setExpenses] = useState<ExpenseLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 서버 상태 → 로컬 입력 폼 동기화
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

  // 지출 합계 (입력 폼 기준 — 즉시 반응)
  const localExpenseTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  // 예상 현금 (실시간 계산)
  const expectedCash = useMemo(() => {
    if (!data) return 0;
    return data.starting_cash + data.total_cash_sales - localExpenseTotal - (deposit || 0);
  }, [data, localExpenseTotal, deposit]);

  const variance = useMemo(() => cashCounted - expectedCash, [cashCounted, expectedCash]);

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
        toast.success('일일 마감 저장 완료');
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '네트워크 오류');
      } finally {
        setSubmitting(false);
      }
    },
    [date, cashCounted, deposit, note, expenses, submitting, mutate]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <form onSubmit={handleSubmit} className="max-w-[760px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">일일 마감</h1>
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

        {data?.is_closed && (
          <div className="rounded-xl bg-[var(--color-system-blue)]/10 text-[var(--color-system-blue)] text-caption1 px-3 py-2">
            ℹ️ 이 영업일은 이미 마감 저장됨. 다시 저장하면 지출·시재·본사입금이 덮어쓰기 됩니다.
          </div>
        )}

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
            {/* 매출 자동 집계 */}
            <Card title="매출 (자동 집계)">
              <Row label="현금 매출" value={data.total_cash_sales} />
              <Row label="카드 매출" value={data.total_card_sales} />
              <Row
                label="매출 합계"
                value={data.total_cash_sales + data.total_card_sales}
                bold
              />
            </Card>

            {/* 지출 라인 */}
            <Card
              title="지출 내역"
              right={
                <button
                  type="button"
                  onClick={handleAddExpense}
                  className="pressable text-caption1 text-[var(--color-system-blue)] font-medium"
                >
                  + 지출 추가
                </button>
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
                        className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1000}
                        value={e.amount || ''}
                        onChange={(ev) => handleExpenseChange(idx, 'amount', Number(ev.target.value) || 0)}
                        placeholder="0"
                        className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveExpense(idx)}
                        aria-label="삭제"
                        className="pressable text-[var(--color-system-red)]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <Row label="지출 합계" value={localExpenseTotal} bold />
                </div>
              )}
            </Card>

            {/* 시재 계산 + 본사 입금 + 실측 */}
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
                  className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums"
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
                  className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums font-semibold"
                />
              </div>
              <Row
                label="차액"
                value={variance}
                bold
                color={variance === 0 ? 'green' : variance < 0 ? 'red' : 'orange'}
              />
            </Card>

            {/* 비고 */}
            <Card title="비고">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="선택 입력"
                rows={2}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Card>

            <button
              type="submit"
              disabled={submitting}
              className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
            >
              {submitting
                ? '저장 중…'
                : data.is_closed
                  ? '마감 갱신'
                  : '일일 마감 저장'}
            </button>
          </>
        )}
      </form>
    </main>
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
