// Frame Ops Web — 본사 통합 통계
// 기간(from/to) + 매장 필터(전체/단일).
// 전체 매장 모드 시 매장별 분해 테이블 노출.

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
  active: boolean;
}

interface ByStoreRow {
  store_id: string;
  store_code: string;
  store_name: string;
  cash: number;
  card: number;
  revenue: number;
  count: number;
}

interface HqStatsResponse {
  period: { from: string; to: string };
  store_id: string | null;
  summary: {
    cash: number;
    card: number;
    revenue: number;
    count: number;
    quantity: number;
  };
  month: { cash: number; card: number; revenue: number; count: number };
  by_store: ByStoreRow[];
  stores: StoreOpt[];
}

const fetcher = async (url: string): Promise<HqStatsResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: HqStatsResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function HqStatsPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());
  const [storeId, setStoreId] = useState<string>('');

  const url = `/api/hq/stats?from=${from}&to=${to}${storeId ? `&store_id=${storeId}` : ''}`;
  const { data, isLoading } = useSWR<HqStatsResponse>(url, fetcher, {
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

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">본사 통합 통계</h1>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_1fr] gap-2 items-end">
            <Field label="시작일">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value || todayDate())}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
            <span className="hidden sm:flex items-center justify-center text-callout text-[var(--color-label-tertiary)] pb-2">~</span>
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
            <Field label="매장">
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              >
                <option value="">전체 매장</option>
                {(data?.stores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.store_code})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickBtn label="오늘" onClick={setQuickToday} />
            <QuickBtn label="7일" onClick={setQuick7} />
            <QuickBtn label="30일" onClick={setQuick30} />
            <QuickBtn label="이번 달" onClick={setMonthRange} />
          </div>
        </div>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            데이터를 불러올 수 없습니다.
          </p>
        ) : (
          <>
            {/* 기간 합계 */}
            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                기간 합계 ({data.summary.count}건 / {data.summary.quantity}점)
              </h2>
              <Stat label="매출" value={data.summary.revenue} bold large />
              <Stat label="현금" value={data.summary.cash} sub />
              <Stat label="카드" value={data.summary.card} sub />
            </section>

            {/* 월누적 */}
            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                이번 달 누적 (1일~종료일)
              </h2>
              <Stat label="매출" value={data.month.revenue} bold large />
              <Stat label="현금" value={data.month.cash} sub />
              <Stat label="카드" value={data.month.card} sub />
            </section>

            {/* 매장별 분해 — 전체 매장 모드일 때만 */}
            {!storeId && data.by_store.length > 0 && (
              <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
                <div className="p-4 border-b border-[var(--color-separator-opaque)]">
                  <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                    매장별 분해
                  </h2>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-callout">
                    <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                      <tr>
                        <th className="text-left p-3">매장</th>
                        <th className="text-right p-3 w-20">건수</th>
                        <th className="text-right p-3 w-32 hidden sm:table-cell">현금</th>
                        <th className="text-right p-3 w-32 hidden sm:table-cell">카드</th>
                        <th className="text-right p-3 w-36">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_store.map((row) => (
                        <tr
                          key={row.store_id}
                          className="border-t border-[var(--color-separator-opaque)]"
                        >
                          <td className="p-3">
                            <div className="font-semibold">{row.store_name}</div>
                            <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                              {row.store_code}
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums">{row.count}</td>
                          <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                            ₩{row.cash.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                            ₩{row.card.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            ₩{row.revenue.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
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
