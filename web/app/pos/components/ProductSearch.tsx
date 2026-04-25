// Frame Ops Phase 2 — 제품 검색 키패드 + 결과 리스트 (디폴트 좌측 뷰)
// 매장 환경(키보드 없는 iPad 등) 의 터치/마우스 전용 워크플로우.
// 키패드(좌)에서 숫자 입력 → 200ms debounce 후 RPC → 우측 결과 리스트 → 행 클릭 시
// 카트 추가 + 입력 자동 초기화 → 연속 추가 가능.

'use client';

import { memo, useCallback, useState } from 'react';
import useSWR from 'swr';
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
  const [draft, setDraft] = useState('');
  const debouncedDraft = useDebounce(draft, 200);

  const swrKey = debouncedDraft.trim()
    ? (['pos-search', debouncedDraft] as const)
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

  // 키보드 타이핑 입력 — 키패드 state 와 동일한 draft 갱신.
  // inputMode="numeric" 으로 모바일에선 숫자 키보드 힌트, 데스크톱에선 일반 문자 가능.
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value.slice(0, 30));
  }, []);

  const handleProductClick = useCallback(
    (row: SearchResultRow) => {
      onSelect({
        id: row.id,
        brand_name: row.brand_name,
        style_code: row.style_code,
        color_code: row.color_code,
        display_name: row.display_name,
        sale_price: row.sale_price,
      });
      // 입력 초기화 → 연속 추가 가능
      setDraft('');
    },
    [onSelect]
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 입력 (키보드 + 키패드 공용) — 두 입력 모두 같은 draft state 갱신 */}
      <div className="px-4 py-3 rounded-xl bg-[var(--color-fill-tertiary)] min-h-[60px] flex items-center gap-3">
        <input
          type="text"
          value={draft}
          onChange={handleInputChange}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="제품번호 입력 (키보드 또는 키패드)"
          aria-label="제품번호"
          className="flex-1 min-w-0 bg-transparent text-title1 font-semibold tabular-nums text-[var(--color-label-primary)] placeholder:text-[var(--color-label-tertiary)] placeholder:font-normal placeholder:text-callout focus:outline-none truncate"
        />
        <span className="text-caption1 text-[var(--color-label-secondary)] tabular-nums flex-none">
          {isValidating && results.length === 0
            ? '검색 중…'
            : debouncedDraft
              ? `${results.length}개`
              : ''}
        </span>
      </div>

      {/* 본문: 좌측 키패드 + 우측 결과 리스트 */}
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
          ) : results.length === 0 ? (
            <EmptyState message={isValidating ? '검색 중…' : `"${debouncedDraft}" 결과 없음`} />
          ) : (
            <div className="divide-y divide-[var(--color-separator-opaque)]">
              {results.map((row) => (
                <ResultRow key={row.id} row={row} onClick={handleProductClick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
// 레이아웃: [브랜드] [제품번호] [칼라] [재고배지(선택)] [여백] [금액]
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
      className="pressable w-full flex items-baseline gap-3 px-3 py-2 text-left"
    >
      {/* 브랜드 */}
      <span className="text-caption2 text-[var(--color-label-secondary)] truncate flex-none max-w-[120px]">
        {row.brand_name}
      </span>

      {/* 제품번호 */}
      <span className="text-callout font-semibold text-[var(--color-label-primary)] tabular-nums flex-none">
        {row.style_code ?? '—'}
      </span>

      {/* 칼라 */}
      {row.color_code && (
        <span className="text-callout text-[var(--color-label-primary)] tabular-nums flex-none">
          {row.color_code}
        </span>
      )}

      {/* 재고 배지 (선택적) */}
      {stockBadge && (
        <span className="text-caption2 text-[var(--color-label-tertiary)] truncate">
          {stockBadge}
        </span>
      )}

      {/* 여백 (spacer) */}
      <span className="flex-1" />

      {/* 금액 */}
      <span className="text-callout font-semibold tabular-nums text-[var(--color-label-primary)] flex-none">
        ₩{(row.sale_price ?? 0).toLocaleString()}
      </span>
    </button>
  );
});
