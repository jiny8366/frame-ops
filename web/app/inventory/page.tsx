// Frame Ops Web — 재고 조회
// fo_products 의 활성 상품을 stock_quantity 기준으로 정렬·검색·필터.

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';

interface ProductRow {
  id: string;
  product_code: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  category: string | null;
  product_line: string | null;
  cost_price: number | null;
  sale_price: number | null;
  stock_quantity: number | null;
  brand: { id: string; name: string } | null;
}

interface Resp { data: ProductRow[] | null; error: string | null }

const fetcher = async (url: string): Promise<ProductRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as Resp;
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function InventoryPage() {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'low' | 'style' | 'recent'>('style');

  const { data: items = [], isLoading } = useSWR<ProductRow[]>(
    '/api/inventory?limit=500',
    fetcher,
    { refreshInterval: 60_000 }
  );

  const filtered = useMemo(() => {
    let arr = items;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((p) =>
        (p.style_code ?? '').toLowerCase().includes(q) ||
        (p.color_code ?? '').toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.brand?.name ?? '').toLowerCase().includes(q)
      );
    }
    arr = [...arr];
    if (sortMode === 'low') {
      arr.sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0));
    } else if (sortMode === 'style') {
      arr.sort((a, b) => (a.style_code ?? '').localeCompare(b.style_code ?? ''));
    }
    return arr;
  }, [items, query, sortMode]);

  const lowCount = items.filter((p) => (p.stock_quantity ?? 0) <= 1).length;
  const totalQty = items.reduce((s, p) => s + (p.stock_quantity ?? 0), 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">재고 조회</h1>

        {/* 요약 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-3 gap-3">
          <SummaryStat label="총 상품" value={items.length} />
          <SummaryStat label="총 재고" value={totalQty} />
          <SummaryStat label="잔량 ≤ 1" value={lowCount} highlight />
        </div>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-[var(--color-label-secondary)]">검색</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="브랜드 / 스타일코드 / 색상 / 제품명"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </label>
          <div className="flex gap-1">
            <SortBtn label="스타일순" active={sortMode === 'style'} onClick={() => setSortMode('style')} />
            <SortBtn label="재고 적은순" active={sortMode === 'low'} onClick={() => setSortMode('low')} />
          </div>
        </div>

        {/* 리스트 */}
        <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 상품이 없습니다.
            </p>
          ) : (
            <div className="overflow-auto max-h-[720px]">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
                  <tr>
                    <th className="text-left p-3">브랜드</th>
                    <th className="text-left p-3">상품</th>
                    <th className="text-left p-3 hidden sm:table-cell">분류</th>
                    <th className="text-right p-3 w-20">재고</th>
                    <th className="text-right p-3 w-24 hidden md:table-cell">원가</th>
                    <th className="text-right p-3 w-28">판매가</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const stock = p.stock_quantity ?? 0;
                    const isLow = stock <= 1;
                    const isOut = stock <= 0;
                    return (
                      <tr key={p.id} className="border-t border-[var(--color-separator-opaque)]">
                        <td className="p-3 text-caption1">{p.brand?.name ?? '—'}</td>
                        <td className="p-3">
                          <div className="font-semibold">
                            {p.style_code ?? '—'}
                            {p.color_code ? ` / ${p.color_code}` : ''}
                          </div>
                          {p.display_name && p.display_name !== p.style_code && (
                            <div className="text-caption2 text-[var(--color-label-tertiary)] truncate max-w-[260px]">
                              {p.display_name}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-caption1 text-[var(--color-label-secondary)] hidden sm:table-cell">
                          {[p.category, p.product_line].filter(Boolean).join('/') || '—'}
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">
                          <span
                            className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full text-caption1',
                              isOut
                                ? 'bg-[var(--color-system-red)]/15 text-[var(--color-system-red)]'
                                : isLow
                                  ? 'bg-[var(--color-system-orange)]/15 text-[var(--color-system-orange)]'
                                  : '',
                            ].join(' ')}
                          >
                            {stock}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums hidden md:table-cell">
                          ₩{(p.cost_price ?? 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          ₩{(p.sale_price ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption2 text-[var(--color-label-tertiary)]">{label}</span>
      <span
        className={`text-headline font-bold tabular-nums ${
          highlight && value > 0 ? 'text-[var(--color-system-orange)]' : 'text-[var(--color-label-primary)]'
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border',
        active
          ? 'bg-[var(--color-system-blue)] text-white border-transparent'
          : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
