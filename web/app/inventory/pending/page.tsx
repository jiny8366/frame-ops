// Frame Ops Phase 2 — 발주 대기 페이지
// stock_quantity < 0 인 활성 제품 목록.
// useSWR 30s refresh 로 새 데이터 자동 반영.

'use client';

import useSWR from 'swr';
import { inventoryApi, type PendingStockItem } from '@/lib/api-client';
import { formatColor, LINE_LABELS } from '@/lib/product-codes';

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
            <div className="data-list-scroll">
              <table className="data-list-table">
                <thead>
                  <tr>
                    <th>라인</th>
                    <th>카테고리</th>
                    <th>브랜드</th>
                    <th>제품번호</th>
                    <th>컬러</th>
                    <th className="num">현재고</th>
                    <th className="num">매입대기</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.product_line
                          ? LINE_LABELS[item.product_line as keyof typeof LINE_LABELS] ?? item.product_line.toUpperCase()
                          : '—'}
                      </td>
                      <td>{item.category ?? '—'}</td>
                      <td>{item.brand_name ?? '—'}</td>
                      <td className="code">{item.style_code ?? '—'}</td>
                      <td className="code">{formatColor(item.color_code)}</td>
                      <td className="num" style={item.stock_quantity < 0 ? { color: 'var(--color-system-red)' } : undefined}>
                        {item.stock_quantity}
                      </td>
                      <td className="num" style={{ color: 'var(--color-system-red)', fontWeight: 700 }}>
                        {item.pending_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
