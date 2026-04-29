// Frame Ops Web — 본사 판매내역
// admin/sales-search 와 동일 동작 + 매장 셀렉터 + 일자별/브랜드별/담당자별 실적 탭.

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from '@/hooks/useDebounce';
import { formatColor } from '@/lib/product-codes';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
  active: boolean;
}

interface SaleLineRow {
  sale_id: string;
  item_id: string;
  sold_at: string;
  store_id: string;
  store_code: string;
  store_name: string;
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

interface ApiResponse {
  rows: SaleLineRow[];
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

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateOnly(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

type ViewTab = 'lines' | 'by_date' | 'by_brand' | 'by_seller';

export default function HqSalesSearchPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());
  const [storeId, setStoreId] = useState<string>('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 250);
  const [tab, setTab] = useState<ViewTab>('lines');

  const url = `/api/hq/sales-search?from=${from}&to=${to}${storeId ? `&store_id=${storeId}` : ''}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`;
  const { data, isLoading } = useSWR<ApiResponse>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // useMemo dep 안정화 — data 가 undefined 일 때마다 새 배열 생성되는 것 방지
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const stores = useMemo(() => data?.stores ?? [], [data]);

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.line_total, 0);

  // 일자별 집계 (sold_at 의 날짜 부분 기준)
  const byDate = useMemo(() => {
    const m = new Map<string, { date: string; qty: number; amount: number; sales: Set<string> }>();
    for (const r of rows) {
      const d = dateOnly(r.sold_at);
      const e = m.get(d) ?? { date: d, qty: 0, amount: 0, sales: new Set<string>() };
      e.qty += r.quantity;
      e.amount += r.line_total;
      e.sales.add(r.sale_id);
      m.set(d, e);
    }
    return Array.from(m.values())
      .map((e) => ({ date: e.date, qty: e.qty, amount: e.amount, saleCount: e.sales.size }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [rows]);

  // 브랜드별 집계
  const byBrand = useMemo(() => {
    const m = new Map<string, { brand: string; qty: number; amount: number; sales: Set<string> }>();
    for (const r of rows) {
      const k = r.brand_name ?? '미지정';
      const e = m.get(k) ?? { brand: k, qty: 0, amount: 0, sales: new Set<string>() };
      e.qty += r.quantity;
      e.amount += r.line_total;
      e.sales.add(r.sale_id);
      m.set(k, e);
    }
    return Array.from(m.values())
      .map((e) => ({ brand: e.brand, qty: e.qty, amount: e.amount, saleCount: e.sales.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  // 담당자별 집계
  const bySeller = useMemo(() => {
    const m = new Map<string, { seller: string; qty: number; amount: number; sales: Set<string> }>();
    for (const r of rows) {
      const k = r.seller_name ?? '미지정';
      const e = m.get(k) ?? { seller: k, qty: 0, amount: 0, sales: new Set<string>() };
      e.qty += r.quantity;
      e.amount += r.line_total;
      e.sales.add(r.sale_id);
      m.set(k, e);
    }
    return Array.from(m.values())
      .map((e) => ({ seller: e.seller, qty: e.qty, amount: e.amount, saleCount: e.sales.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

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
          <Field label="제품 검색 (브랜드 / 제품번호 / 컬러)">
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

        {/* 탭 */}
        <div role="tablist" className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[var(--color-fill-quaternary)]">
          {([
            ['lines', '거래내역'],
            ['by_date', '일자별'],
            ['by_brand', '브랜드별'],
            ['by_seller', '담당자별'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`pressable touch-target rounded-md px-3 py-2 text-callout font-medium transition-colors ${
                tab === key
                  ? 'bg-[var(--color-bg-primary)] text-[var(--color-label-primary)] shadow-sm'
                  : 'text-[var(--color-label-secondary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 컨텐츠 */}
        <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading && rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 판매 내역이 없습니다.
            </p>
          ) : tab === 'lines' ? (
            <div className="data-list-scroll" style={{ maxHeight: 720 }}>
              <table className="data-list-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>일시</th>
                    <th>매장</th>
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
                      <td className="num" style={{ textAlign: 'left' }}>{formatDateTime(r.sold_at)}</td>
                      <td>{r.store_name || '—'}</td>
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
                    <td colSpan={5}>합계</td>
                    <td className="num">{totalQty}</td>
                    <td colSpan={2}></td>
                    <td className="num">₩{totalAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : tab === 'by_date' ? (
            <AggTable
              keyLabel="날짜"
              rows={byDate.map((r) => ({ key: r.date, qty: r.qty, amount: r.amount, sales: r.saleCount }))}
              total={{ qty: totalQty, amount: totalAmount, sales: new Set(rows.map((r) => r.sale_id)).size }}
            />
          ) : tab === 'by_brand' ? (
            <AggTable
              keyLabel="브랜드"
              rows={byBrand.map((r) => ({ key: r.brand, qty: r.qty, amount: r.amount, sales: r.saleCount }))}
              total={{ qty: totalQty, amount: totalAmount, sales: new Set(rows.map((r) => r.sale_id)).size }}
            />
          ) : (
            <AggTable
              keyLabel="담당자"
              rows={bySeller.map((r) => ({ key: r.seller, qty: r.qty, amount: r.amount, sales: r.saleCount }))}
              total={{ qty: totalQty, amount: totalAmount, sales: new Set(rows.map((r) => r.sale_id)).size }}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function AggTable({
  keyLabel,
  rows,
  total,
}: {
  keyLabel: string;
  rows: Array<{ key: string; qty: number; amount: number; sales: number }>;
  total: { qty: number; amount: number; sales: number };
}) {
  return (
    <div className="data-list-scroll" style={{ maxHeight: 720 }}>
      <table className="data-list-table">
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            <th>{keyLabel}</th>
            <th className="num">건수</th>
            <th className="num">수량</th>
            <th className="num">매출</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td className="num">{r.sales}</td>
              <td className="num">{r.qty}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                ₩{r.amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>합계</td>
            <td className="num">{total.sales}</td>
            <td className="num">{total.qty}</td>
            <td className="num">₩{total.amount.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
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
