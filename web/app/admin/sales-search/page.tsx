// Frame Ops Web — 판매내역 검색
// 기간 + 제품 키워드 필터 → 판매 행 + 담당자 + 항목 요약 + 결제수단.

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from '@/hooks/useDebounce';

interface SaleRow {
  sale_id: string;
  sold_at: string;
  cash_amount: number;
  card_amount: number;
  discount_total: number;
  total_amount: number;
  payment_method: string;
  seller_user_id: string | null;
  seller_name: string | null;
  item_count: number;
  items_summary: string | null;
}

const fetcher = async (url: string): Promise<SaleRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: SaleRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SalesSearchPage() {
  const [from, setFrom] = useState<string>(daysAgo(7));
  const [to, setTo] = useState<string>(todayDate());
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  const url = `/api/admin/sales-search?from=${from}&to=${to}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`;
  const { data: rows = [], isLoading } = useSWR<SaleRow[]>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const totalRevenue = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">판매내역 검색</h1>

        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_2fr] gap-2 items-end">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value || todayDate())}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <span className="hidden md:flex items-center justify-center text-callout text-[var(--color-label-tertiary)] pb-2">
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
          <Field label="제품 검색 (스타일 / 제품명 / 색상)">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="비워두면 전체"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        {/* 합계 */}
        <div className="flex items-center justify-between px-1">
          <span className="text-caption1 text-[var(--color-label-secondary)]">
            결과 {rows.length}건 {rows.length === 200 ? '(상한 200)' : ''}
          </span>
          <span className="text-callout font-semibold tabular-nums">
            합계 ₩{totalRevenue.toLocaleString()}
          </span>
        </div>

        {/* 결과 리스트 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading && rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 판매 내역이 없습니다.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap">일시</th>
                    <th className="text-left p-3">상품</th>
                    <th className="text-left p-3 w-24 whitespace-nowrap">담당자</th>
                    <th className="text-right p-3 w-24 whitespace-nowrap">결제수단</th>
                    <th className="text-right p-3 w-32 whitespace-nowrap">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.sale_id}
                      className="border-t border-[var(--color-separator-opaque)]"
                    >
                      <td className="p-3 text-caption1 tabular-nums whitespace-nowrap">
                        {formatDateTime(r.sold_at)}
                      </td>
                      <td className="p-3">
                        <div className="text-caption2 text-[var(--color-label-tertiary)]">
                          {r.item_count}건
                        </div>
                        <div className="truncate max-w-[420px]" title={r.items_summary ?? ''}>
                          {r.items_summary ?? '—'}
                        </div>
                      </td>
                      <td className="p-3 text-callout">{r.seller_name ?? '—'}</td>
                      <td className="p-3 text-right">
                        <PaymentBadge method={r.payment_method} />
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        ₩{r.total_amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

function PaymentBadge({ method }: { method: string }) {
  const colorMap: Record<string, string> = {
    현금: 'var(--color-system-green)',
    카드: 'var(--color-system-blue)',
    혼합: 'var(--color-system-orange)',
  };
  const c = colorMap[method] ?? 'var(--color-label-tertiary)';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-caption2 font-medium"
      style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)` }}
    >
      {method}
    </span>
  );
}
