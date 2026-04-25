// Frame Ops Phase 2 — 발주 대기 페이지
// stock_quantity < 0 인 활성 제품 목록.
// useSWR 30s refresh 로 새 데이터 자동 반영.

'use client';

import useSWR from 'swr';
import { inventoryApi, type PendingStockItem } from '@/lib/api-client';

export default function PendingStockPage() {
  const { data: items = [], isLoading, error } = useSWR<PendingStockItem[]>(
    'pending-stock',
    async () => {
      const { data, error: err } = await inventoryApi.pending();
      if (err) throw new Error(err);
      return data ?? [];
    },
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-system-blue)] border-t-transparent" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4">
        <p className="text-callout text-[var(--color-system-red)]">
          발주 목록 로딩 실패: {String(error)}
        </p>
      </main>
    );
  }

  const totalPending = items.reduce((sum, i) => sum + i.pending_count, 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding">
      <header className="sticky top-0 z-10 bg-[var(--color-bg-primary)]/95 backdrop-blur-sm px-4 py-3 border-b border-[var(--color-separator-opaque)]">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
          발주 필요 제품
        </h1>
        <p className="mt-1 text-footnote text-[var(--color-label-secondary)]">
          {items.length}개 상품 · 총 {totalPending}개 매입 대기
        </p>
      </header>

      <section className="p-4">
        {items.length === 0 ? (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] py-10 text-center">
            <p className="text-callout text-[var(--color-label-secondary)]">
              발주할 제품이 없습니다. 모든 재고가 충분합니다. 👍
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
            {items.map((item) => (
              <PendingRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PendingRow({ item }: { item: PendingStockItem }) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-3 border-b border-[var(--color-separator-opaque)] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-caption2 text-[var(--color-label-secondary)] truncate">
            {item.brand_name}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-callout font-semibold text-[var(--color-label-primary)] truncate">
            {item.style_code ?? '—'}
            {item.color_code ? ` / ${item.color_code}` : ''}
          </span>
        </div>
        {item.display_name && item.display_name !== item.style_code && (
          <p className="text-caption1 text-[var(--color-label-secondary)] truncate">
            {item.display_name}
          </p>
        )}
      </div>
      <span className="text-callout font-bold tabular-nums text-[var(--color-system-red)]">
        {item.pending_count}개
      </span>
    </div>
  );
}
