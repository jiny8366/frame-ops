// Frame Ops Web — 매장 비교
// 기간 내 활성 매장별 KPI (매출/현금/카드/건수/점수/평균객단가) 비교 + 막대 그래프.

'use client';

import { useCallback, useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

interface ComparisonRow {
  store_id: string;
  store_code: string;
  store_name: string;
  revenue: number;
  cash: number;
  card: number;
  sale_count: number;
  item_quantity: number;
  avg_ticket: number;
}

interface ApiResponse {
  period: { from: string; to: string };
  rows: ComparisonRow[];
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: ApiResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function HqComparisonPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());

  const url = `/api/hq/comparison?from=${from}&to=${to}`;
  const { data, isLoading } = useSWR<ApiResponse>(url, fetcher, {
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

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const totals = useMemo(() => {
    return {
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      cash: rows.reduce((s, r) => s + r.cash, 0),
      card: rows.reduce((s, r) => s + r.card, 0),
      sale_count: rows.reduce((s, r) => s + r.sale_count, 0),
      item_quantity: rows.reduce((s, r) => s + r.item_quantity, 0),
    };
  }, [rows]);

  const chartData = rows.map((r) => ({
    name: r.store_code,
    매출: r.revenue,
  }));

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매장 비교</h1>

        {/* 필터 */}
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
        ) : !data || rows.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            기간 내 데이터가 없습니다.
          </p>
        ) : (
          <>
            {/* 매장별 매출 막대 그래프 */}
            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-2">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                매장별 매출
              </h2>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 12, left: 12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-label-tertiary)"
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-label-tertiary)"
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `${Math.round(v / 100_000) / 10}M`
                          : v >= 1000
                            ? `${Math.round(v / 1000)}K`
                            : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-separator-opaque)',
                        fontSize: 12,
                      }}
                      formatter={((value: number) =>
                        `₩${value.toLocaleString()}`) as never}
                    />
                    <Bar dataKey="매출" fill="var(--color-system-blue)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 비교 테이블 */}
            <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-separator-opaque)] flex items-baseline justify-between flex-wrap gap-2">
                <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  매장별 KPI ({rows.length}개 매장)
                </h2>
                <span className="text-caption1 text-[var(--color-label-tertiary)]">
                  매출 합계 ₩{totals.revenue.toLocaleString()}
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-callout">
                  <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                    <tr>
                      <th className="text-left p-3">매장</th>
                      <th className="text-right p-3">매출</th>
                      <th className="text-right p-3 hidden md:table-cell">현금</th>
                      <th className="text-right p-3 hidden md:table-cell">카드</th>
                      <th className="text-right p-3 w-20">건수</th>
                      <th className="text-right p-3 w-20 hidden sm:table-cell">점수</th>
                      <th className="text-right p-3 hidden lg:table-cell">평균객단가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.store_id}
                        className="border-t border-[var(--color-separator-opaque)]"
                      >
                        <td className="p-3">
                          <div className="font-semibold">{r.store_name}</div>
                          <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                            {r.store_code}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">
                          ₩{r.revenue.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums hidden md:table-cell">
                          ₩{r.cash.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums hidden md:table-cell">
                          ₩{r.card.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums">{r.sale_count}</td>
                        <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                          {r.item_quantity}
                        </td>
                        <td className="p-3 text-right tabular-nums hidden lg:table-cell">
                          ₩{r.avg_ticket.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[var(--color-separator-opaque)] bg-[var(--color-fill-quaternary)] font-semibold">
                      <td className="p-3">합계</td>
                      <td className="p-3 text-right tabular-nums">
                        ₩{totals.revenue.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums hidden md:table-cell">
                        ₩{totals.cash.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums hidden md:table-cell">
                        ₩{totals.card.toLocaleString()}
                      </td>
                      <td className="p-3 text-right tabular-nums">{totals.sale_count}</td>
                      <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                        {totals.item_quantity}
                      </td>
                      <td className="p-3 text-right tabular-nums hidden lg:table-cell">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
