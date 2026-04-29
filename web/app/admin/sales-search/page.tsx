// Frame Ops Web — 판매내역 검색
// 라인 단위 표시 — 일시 / 브랜드 / 제품번호 / 컬러 / 수량 / 담당자 / 결제수단 / 금액

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from '@/hooks/useDebounce';
import { formatColor } from '@/lib/product-codes';

interface SaleLineRow {
  sale_id: string;
  item_id: string;
  sold_at: string;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  line_total: number;
  seller_name: string | null;
  payment_method: string;
}

const fetcher = async (url: string): Promise<SaleLineRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: SaleLineRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function SalesSearchPage() {
  // 기본값: 시작일·종료일 모두 오늘
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);

  const url = `/api/admin/sales-search?from=${from}&to=${to}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`;
  const { data: rows = [], isLoading } = useSWR<SaleLineRow[]>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.line_total, 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">판매내역 검색</h1>

        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_2fr] gap-2 items-end">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to || todayDate()}
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
          <Field label="제품 검색 (브랜드 / 제품번호 / 컬러 — 비워두면 전체)">
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
            결과 {rows.length}건 · 수량 {totalQty}점
          </span>
          <span className="text-callout font-semibold tabular-nums">
            합계 ₩{totalAmount.toLocaleString()}
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
            <div className="data-list-scroll">
              <table className="data-list-table">
                <thead>
                  <tr>
                    <th>일시</th>
                    <th>브랜드</th>
                    <th>제품번호</th>
                    <th>컬러</th>
                    <th className="num">수량</th>
                    <th>담당자</th>
                    <th>결제수단</th>
                    <th className="num">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.item_id}>
                      <td className="num" style={{ textAlign: 'left' }}>
                        {formatDateTime(r.sold_at)}
                      </td>
                      <td>{r.brand_name ?? '—'}</td>
                      <td className="code">{r.style_code ?? '—'}</td>
                      <td className="code">{formatColor(r.color_code)}</td>
                      <td className="num">{r.quantity}</td>
                      <td>{r.seller_name ?? '—'}</td>
                      <td>
                        <PaymentBadge method={r.payment_method} />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        ₩{r.line_total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>합계</td>
                    <td className="num">{totalQty}</td>
                    <td colSpan={2}></td>
                    <td className="num">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
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
