// Frame Ops Web — 판매통계
// 기간 (시작~종료) 매출/현금/카드 + 이번 달 누적 + Top 판매 상품 리스트.

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { formatColor } from '@/lib/product-codes';

interface StatsResponse {
  period: { from: string; to: string };
  summary: {
    period_cash: number;
    period_card: number;
    period_revenue: number;
    period_count: number;
    month_cash: number;
    month_card: number;
    month_revenue: number;
  } | null;
  top_products: Array<{
    product_id: string;
    brand_name: string | null;
    style_code: string | null;
    color_code: string | null;
    display_name: string | null;
    category: string | null;
    product_line: string | null;
    total_quantity: number;
    total_revenue: number;
  }>;
}

function joinParts(parts: Array<string | null | undefined>, sep = '/'): string {
  return parts.filter((p): p is string => !!p && p.trim().length > 0).join(sep);
}

const fetcher = async (url: string): Promise<StatsResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StatsResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function StatsPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());

  const url = `/api/admin/stats?from=${from}&to=${to}`;
  const { data, isLoading } = useSWR<StatsResponse>(url, fetcher, {
    revalidateOnFocus: false,
  });

  const setQuickToday = useCallback(() => {
    const t = todayDate();
    setFrom(t);
    setTo(t);
  }, []);
  const setQuick7 = useCallback(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    setFrom(start.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
  }, []);
  const setQuick30 = useCallback(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    setFrom(start.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
  }, []);
  const setMonthRange = useCallback(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    setFrom(start.toISOString().slice(0, 10));
    setTo(today.toISOString().slice(0, 10));
  }, []);

  const summary = data?.summary;
  const products = data?.top_products ?? [];

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[900px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">판매통계</h1>

        {/* 기간 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <Field label="시작일">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value || todayDate())}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
            <span className="hidden sm:flex items-center justify-center text-callout text-[var(--color-label-tertiary)] pb-2">
              ~
            </span>
            <Field label="종료일">
              <input
                type="date"
                value={to}
                min={from}
                max={todayDate()}
                onChange={(e) => setTo(e.target.value || todayDate())}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickBtn label="오늘" onClick={setQuickToday} />
            <QuickBtn label="7일" onClick={setQuick7} />
            <QuickBtn label="30일" onClick={setQuick30} />
            <QuickBtn label="이번 달" onClick={setMonthRange} />
          </div>
        </div>

        {/* 요약 */}
        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !summary ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            데이터를 불러올 수 없습니다.
          </p>
        ) : (
          <>
            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                기간 합계 ({summary.period_count}건)
              </h2>
              <Stat label="매출" value={summary.period_revenue} bold large />
              <Stat label="현금" value={summary.period_cash} sub />
              <Stat label="카드" value={summary.period_card} sub />
            </section>

            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                이번 달 누적 (1일~종료일 기준)
              </h2>
              <Stat label="매출" value={summary.month_revenue} bold large />
              <Stat label="현금" value={summary.month_cash} sub />
              <Stat label="카드" value={summary.month_card} sub />
            </section>

            <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-separator-opaque)]">
                <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  Top 판매 상품 ({products.length})
                </h2>
              </div>
              {products.length === 0 ? (
                <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
                  기간 내 판매 내역이 없습니다.
                </p>
              ) : (
                <table className="w-full text-callout">
                  <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                    <tr>
                      <th className="text-left p-3">상품</th>
                      <th className="text-left p-3">분류</th>
                      <th className="text-right p-3 w-20">수량</th>
                      <th className="text-right p-3 w-32">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const isRefund = p.total_quantity < 0 || p.total_revenue < 0;
                      return (
                        <tr
                          key={p.product_id}
                          className={[
                            'border-t border-[var(--color-separator-opaque)]',
                            isRefund ? 'bg-[var(--color-system-red)]/5' : '',
                          ].join(' ')}
                        >
                          <td className="p-3 font-semibold">
                            {isRefund && (
                              <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded text-caption2 font-semibold bg-[var(--color-system-red)] text-white">
                                반품
                              </span>
                            )}
                            {joinParts([p.brand_name, p.style_code, p.color_code ? formatColor(p.color_code) : null]) || '—'}
                          </td>
                          <td className="p-3 text-caption1 text-[var(--color-label-secondary)]">
                            {joinParts([p.category, p.product_line]) || '—'}
                          </td>
                          <td
                            className={[
                              'p-3 text-right tabular-nums font-semibold',
                              isRefund ? 'text-[var(--color-system-red)]' : '',
                            ].join(' ')}
                          >
                            {p.total_quantity}
                          </td>
                          <td
                            className={[
                              'p-3 text-right tabular-nums font-semibold',
                              isRefund ? 'text-[var(--color-system-red)]' : '',
                            ].join(' ')}
                          >
                            ₩{(p.total_revenue ?? 0).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption1 text-[var(--color-label-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable touch-target rounded-lg px-3 py-1.5 bg-[var(--color-fill-quaternary)] text-caption1 font-medium text-[var(--color-label-primary)]"
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  bold,
  sub,
  large,
}: {
  label: string;
  value: number;
  bold?: boolean;
  sub?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span
        className={`${
          sub
            ? 'text-callout text-[var(--color-label-secondary)]'
            : 'text-callout text-[var(--color-label-primary)]'
        }${bold ? ' font-semibold' : ''}`}
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${large ? 'text-title3' : 'text-callout'} ${
          bold ? 'font-bold' : ''
        }`}
      >
        ₩{(value ?? 0).toLocaleString()}
      </span>
    </div>
  );
}
