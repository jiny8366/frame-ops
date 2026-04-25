// Frame Ops Phase 2 — 상품검색 키패드 다이얼로그
// 터치/마우스만으로 숫자 입력 → 실시간 결과 → 선택 → 카트 추가 → 입력 초기화 (다이얼로그 유지).
// 키보드 없는 환경 (매장 iPad 등) 의 빠른 연속 입력에 최적화.

'use client';

import { memo, useCallback, useState } from 'react';
import useSWR from 'swr';
import { Modal } from './Modal';
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

export interface ProductSearchDialogProps {
  onSelect: (product: CartProductSnapshot) => void;
  onClose: () => void;
}

export const ProductSearchDialog = memo(function ProductSearchDialog({
  onSelect,
  onClose,
}: ProductSearchDialogProps) {
  // ⭐ 입력 state 는 다이얼로그 내부에만 (PHASE2_DESIGN_PATTERNS §1)
  const [draft, setDraft] = useState('');
  const debouncedDraft = useDebounce(draft, 200);

  const swrKey = debouncedDraft.trim()
    ? (['pos-search-dialog', debouncedDraft] as const)
    : null;

  const { data: results = [], isValidating } = useSWR<SearchResultRow[]>(
    swrKey,
    async () => {
      const { data, error } = await productsSearch(debouncedDraft, null, 50, 0);
      if (error) throw new Error(error);
      return (data ?? []) as SearchResultRow[];
    },
    { revalidateOnFocus: false, keepPreviousData: false }
  );

  const handleAppend = useCallback((d: string) => {
    setDraft((prev) => (prev + d).slice(0, 30));
  }, []);

  const handleBackspace = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => setDraft(''), []);

  const handleProductClick = useCallback(
    (row: SearchResultRow) => {
      onSelect({
        id: row.id,
        style_code: row.style_code,
        display_name: row.display_name,
        sale_price: row.sale_price,
      });
      // 입력 초기화 → 다이얼로그 유지 → 연속 추가 가능
      setDraft('');
    },
    [onSelect]
  );

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-3 p-4 w-[min(720px,92vw)] h-[min(680px,86vh)]">
        {/* 헤더 */}
        <div className="flex items-baseline justify-between">
          <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
            상품 검색
          </h3>
          {debouncedDraft && (
            <span className="text-caption1 text-[var(--color-label-secondary)] tabular-nums">
              {results.length}개 결과
            </span>
          )}
        </div>

        {/* 입력 디스플레이 */}
        <div className="px-4 py-3 rounded-xl bg-[var(--color-fill-tertiary)] min-h-[60px] flex items-center justify-center">
          {draft ? (
            <span className="text-title1 font-semibold tabular-nums text-[var(--color-label-primary)]">
              {draft}
            </span>
          ) : (
            <span className="text-callout text-[var(--color-label-tertiary)]">
              숫자를 입력하세요
            </span>
          )}
        </div>

        {/* 본문: 좌측 키패드 / 우측 결과 */}
        <div className="grid grid-cols-[auto_1fr] gap-3 flex-1 min-h-0">
          {/* 키패드 */}
          <div className="grid grid-cols-3 gap-2 content-start">
            <DigitButton digit="1" onPress={handleAppend} />
            <DigitButton digit="2" onPress={handleAppend} />
            <DigitButton digit="3" onPress={handleAppend} />
            <DigitButton digit="4" onPress={handleAppend} />
            <DigitButton digit="5" onPress={handleAppend} />
            <DigitButton digit="6" onPress={handleAppend} />
            <DigitButton digit="7" onPress={handleAppend} />
            <DigitButton digit="8" onPress={handleAppend} />
            <DigitButton digit="9" onPress={handleAppend} />
            <ActionButton label="지움" onPress={handleClear} />
            <DigitButton digit="0" onPress={handleAppend} />
            <ActionButton label="⌫" onPress={handleBackspace} />
          </div>

          {/* 결과 리스트 */}
          <div className="overflow-auto rounded-xl bg-[var(--color-bg-secondary)]">
            {!debouncedDraft.trim() ? (
              <EmptyState message="숫자를 입력하면 결과가 표시됩니다" />
            ) : isValidating && results.length === 0 ? (
              <EmptyState message="검색 중…" />
            ) : results.length === 0 ? (
              <EmptyState message={`"${debouncedDraft}" 결과 없음`} />
            ) : (
              <div className="divide-y divide-[var(--color-separator-opaque)]">
                {results.map((row) => (
                  <ResultRow key={row.id} row={row} onClick={handleProductClick} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 닫기 */}
        <button
          type="button"
          onClick={onClose}
          className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
});

// ── 디지트 버튼 ──────────────────────────────────────────────────────────────
interface DigitButtonProps {
  digit: string;
  onPress: (digit: string) => void;
}

const DigitButton = memo(function DigitButton({ digit, onPress }: DigitButtonProps) {
  const handleClick = useCallback(() => onPress(digit), [digit, onPress]);
  return (
    <button
      type="button"
      onClick={handleClick}
      className="pressable touch-target-lg rounded-xl bg-[var(--color-bg-secondary)] text-title2 font-medium text-[var(--color-label-primary)] min-w-[72px]"
    >
      {digit}
    </button>
  );
});

// ── 액션 버튼 (지움/⌫) ───────────────────────────────────────────────────────
interface ActionButtonProps {
  label: string;
  onPress: () => void;
}

const ActionButton = memo(function ActionButton({ label, onPress }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="pressable touch-target-lg rounded-xl bg-[var(--color-fill-secondary)] text-headline font-medium text-[var(--color-label-secondary)] min-w-[72px]"
    >
      {label}
    </button>
  );
});

// ── 빈 상태 안내 ─────────────────────────────────────────────────────────────
const EmptyState = memo(function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[var(--color-label-tertiary)] text-callout p-4 text-center">
      {message}
    </div>
  );
});

// ── 결과 행 ──────────────────────────────────────────────────────────────────
interface ResultRowProps {
  row: SearchResultRow;
  onClick: (row: SearchResultRow) => void;
}

const ResultRow = memo(function ResultRow({ row, onClick }: ResultRowProps) {
  const handleClick = useCallback(() => onClick(row), [row, onClick]);

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
      className="pressable w-full px-3 py-2 text-left"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-callout font-semibold text-[var(--color-label-primary)] truncate">
          {row.style_code ?? '—'}
          {row.color_code ? ` / ${row.color_code}` : ''}
        </span>
        <span className="text-callout font-semibold tabular-nums text-[var(--color-label-primary)] flex-none">
          ₩{(row.sale_price ?? 0).toLocaleString()}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-0.5">
        <span className="text-caption2 text-[var(--color-label-secondary)] truncate">
          {row.brand_name}
          {row.display_name && row.display_name !== row.style_code
            ? ` · ${row.display_name}`
            : ''}
        </span>
        {stockBadge && (
          <span className="text-caption2 text-[var(--color-label-tertiary)] flex-none">
            {stockBadge}
          </span>
        )}
      </div>
    </button>
  );
});
