// Frame Ops Web — 본사 판매내역 검색
// 기간 + 키워드 + 매장 필터. 결과에 매장명 컬럼 포함.

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from '@/hooks/useDebounce';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
  active: boolean;
}

interface SaleRow {
  sale_id: string;
  sold_at: string;
  store_id: string;
  store_code: string;
  store_name: string;
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

interface ApiResponse {
  rows: SaleRow[];
  stores: StoreOpt[];
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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HqSalesSearchPage() {
  const [from, setFrom] = useState<string>(daysAgo(7));
  const [to, setTo] = useState<string>(todayDate());
  const [storeId, setStoreId] = useState<string>('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  const url = `/api/hq/sales-search?from=${from}&to=${to}${storeId ? `&store_id=${storeId}` : ''}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`;
  const { data, isLoading } = useSWR<ApiResponse>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const rows = data?.rows ?? [];
  const stores = data?.stores ?? [];
  const totalRevenue = rows.reduce((s, r) => s + r.total_amount, 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">본사 판매내역</h1>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr_2fr] gap-2 items-end">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value || todayDate())}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <span className="hidden md:flex items-center justify-center text-callout text-[var(--color-label-tertiary)] pb-2">~</span>
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
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.store_code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="제품 키워드">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="스타일코드/제품명/색상"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        {/* 합계 + 결과 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-3 flex items-baseline justify-between flex-wrap gap-2">
          <span className="text-callout font-semibold">
            결과 {rows.length.toLocaleString()}건
          </span>
          <span className="text-callout tabular-nums font-bold">
            합계 ₩{totalRevenue.toLocaleString()}
          </span>
        </div>

        <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading && rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 판매 내역이 없습니다.
            </p>
          ) : (
            <div className="overflow-auto max-h-[720px]">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap">일시</th>
                    <th className="text-left p-3">매장</th>
                    <th className="text-left p-3">담당자</th>
                    <th className="text-left p-3 hidden md:table-cell">항목</th>
                    <th className="text-left p-3 w-20">결제</th>
                    <th className="text-right p-3 w-28">금액</th>
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
                      <td className="p-3 text-caption1">
                        <div>{r.store_name}</div>
                        <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                          {r.store_code}
                        </div>
                      </td>
                      <td className="p-3 text-caption1">{r.seller_name ?? '—'}</td>
                      <td className="p-3 text-caption1 hidden md:table-cell">
                        <div className="truncate max-w-[300px]">
                          {r.items_summary ?? `${r.item_count}건`}
                        </div>
                      </td>
                      <td className="p-3 text-caption1">{r.payment_method}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">
                        ₩{r.total_amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
