// Frame Ops Phase 2 — 제품 검색 + 결과 그리드
// useDebounce 로 키 입력마다 RPC 호출 방지 (200ms).
// SWR 로 결과 캐시.

'use client';

import { memo, useCallback, useState } from 'react';
import useSWR from 'swr';
import { ProductSearchDialog } from './ProductSearchDialog';
import { productsSearch } from '@/lib/api-client';
import { useDebounce } from '@/hooks/useDebounce';
import type { CartProductSnapshot } from '@/hooks/useCart';

interface SearchResultRow {
  id: string;
  brand_id: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  sale_price: number | null;
  stock_quantity: number | null;
  brand_name: string;
}

export interface ProductSearchProps {
  onSelect: (product: CartProductSnapshot) => void;
}

export const ProductSearch = memo(function ProductSearch({ onSelect }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  // 검색어가 비어있으면 SWR 호출 자체를 중단 (빈 q 로 RPC 호출 시 전체 활성 제품
  // 50개 반환됨 → 첫 화면에 의도하지 않은 상품 노출 방지).
  const swrKey = debouncedQuery.trim() ? (['pos-search', debouncedQuery] as const) : null;

  const { data: results = [], isValidating } = useSWR<SearchResultRow[]>(
    swrKey,
    async () => {
      const { data, error } = await productsSearch(debouncedQuery, null, 50, 0);
      if (error) throw new Error(error);
      return (data ?? []) as SearchResultRow[];
    },
    { revalidateOnFocus: false, keepPreviousData: false }
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleClear = useCallback(() => setQuery(''), []);

  const handleOpenKeypad = useCallback(() => setKeypadOpen(true), []);
  const handleCloseKeypad = useCallback(() => setKeypadOpen(false), []);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 검색 입력 + 상품검색 버튼 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="키보드 검색…"
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-secondary)] px-4 py-3 placeholder:text-[var(--color-label-tertiary)] focus:border-[var(--color-system-blue)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="검색어 지움"
              className="pressable absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-label-tertiary)]"
            >
              ✕
            </button>
          )}
          {isValidating && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-system-blue)] border-t-transparent" />
          )}
        </div>
        <button
          type="button"
          onClick={handleOpenKeypad}
          className="pressable touch-target-lg rounded-xl px-5 bg-[var(--color-system-blue)] text-white font-semibold whitespace-nowrap"
        >
          상품검색
        </button>
      </div>

      {/* 결과 그리드 */}
      <div className="flex-1 overflow-auto">
        {results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-label-tertiary)] text-callout">
            {debouncedQuery ? `"${debouncedQuery}" 결과 없음` : '검색어를 입력하거나 우측 "상품검색" 버튼으로 키패드를 사용하세요'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {results.map((row) => (
              <ProductCard key={row.id} row={row} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>

      {/* 키패드 다이얼로그 */}
      {keypadOpen && (
        <ProductSearchDialog onSelect={onSelect} onClose={handleCloseKeypad} />
      )}
    </div>
  );
});

// ── 결과 카드 ─────────────────────────────────────────────────────────────────
interface ProductCardProps {
  row: SearchResultRow;
  onSelect: (product: CartProductSnapshot) => void;
}

const ProductCard = memo(function ProductCard({ row, onSelect }: ProductCardProps) {
  const handleClick = useCallback(() => {
    onSelect({
      id: row.id,
      style_code: row.style_code,
      display_name: row.display_name,
      sale_price: row.sale_price,
    });
  }, [row.id, row.style_code, row.display_name, row.sale_price, onSelect]);

  const stockBadge =
    row.stock_quantity == null
      ? null
      : row.stock_quantity < 0
        ? `매입대기 ${Math.abs(row.stock_quantity)}`
        : row.stock_quantity === 0
          ? '재고없음'
          : `재고 ${row.stock_quantity}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="pressable touch-target-lg flex flex-col items-start gap-1 p-3 rounded-xl bg-[var(--color-bg-secondary)] text-left"
    >
      <span className="text-caption2 text-[var(--color-label-secondary)] truncate w-full">
        {row.brand_name}
      </span>
      <span className="text-callout font-semibold text-[var(--color-label-primary)] truncate w-full">
        {row.style_code ?? '—'}
        {row.color_code ? ` / ${row.color_code}` : ''}
      </span>
      {row.display_name && row.display_name !== row.style_code && (
        <span className="text-caption1 text-[var(--color-label-secondary)] truncate w-full">
          {row.display_name}
        </span>
      )}
      <div className="flex items-baseline justify-between w-full mt-1">
        <span className="text-callout font-semibold tabular-nums text-[var(--color-label-primary)]">
          ₩{(row.sale_price ?? 0).toLocaleString()}
        </span>
        {stockBadge && (
          <span className="text-caption2 text-[var(--color-label-tertiary)]">{stockBadge}</span>
        )}
      </div>
    </button>
  );
});
