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
import { Modal } from './Modal';

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

  // 키보드 타이핑 입력 — 한글/기호 차단, 영숫자만 허용 (대문자 자동 변환).
  // T9 키패드와 일관성 유지 + 검색 매칭 단순화.
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
    setDraft(cleaned.slice(0, 30));
  }, []);

  // 재고 1 (전시상품) 인 경우 사용자 확인을 받기 위한 보류 상태
  const [pending, setPending] = useState<SearchResultRow | null>(null);

  const addToCart = useCallback(
    (row: SearchResultRow) => {
      onSelect({
        id: row.id,
        brand_name: row.brand_name,
        style_code: row.style_code,
        color_code: row.color_code,
        display_name: row.display_name,
        sale_price: row.sale_price,
      });
      setDraft('');
    },
    [onSelect]
  );

  const handleProductClick = useCallback(
    (row: SearchResultRow) => {
      // 재고 1 이하(0, 음수 포함) 시 경고 모달. NULL 은 재고 정보 없음 → 모달 스킵.
      const stock = row.stock_quantity;
      if (stock !== null && stock <= 1) {
        setPending(row);
        return;
      }
      addToCart(row);
    },
    [addToCart]
  );

  const handleConfirmPending = useCallback(() => {
    if (pending) addToCart(pending);
    setPending(null);
  }, [pending, addToCart]);

  const handleCancelPending = useCallback(() => {
    setPending(null);
  }, []);

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
          placeholder="제품번호 또는 영문(T9) — 예: 7732 → SPE…"
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
        {/* 키패드 — T9 (전화기 키패드) 영문 라벨 포함 */}
        <div className="grid grid-cols-3 gap-2 content-start">
          <DigitButton digit="1" letters="" onPress={handleAppend} />
          <DigitButton digit="2" letters="ABC" onPress={handleAppend} />
          <DigitButton digit="3" letters="DEF" onPress={handleAppend} />
          <DigitButton digit="4" letters="GHI" onPress={handleAppend} />
          <DigitButton digit="5" letters="JKL" onPress={handleAppend} />
          <DigitButton digit="6" letters="MNO" onPress={handleAppend} />
          <DigitButton digit="7" letters="PQRS" onPress={handleAppend} />
          <DigitButton digit="8" letters="TUV" onPress={handleAppend} />
          <DigitButton digit="9" letters="WXYZ" onPress={handleAppend} />
          <ActionButton label="지움" onPress={handleClear} />
          <DigitButton digit="0" letters="" onPress={handleAppend} />
          <ActionButton label="⌫" onPress={handleBackspace} />
        </div>

        {/* 결과 리스트 */}
        <div className="overflow-auto rounded-xl bg-[var(--color-bg-secondary)]">
          {!debouncedDraft.trim() ? (
            <EmptyState message="숫자(제품번호) 또는 키패드 영문(T9) 입력 — 예: 7732 → SPECTER" />
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

      {/* 재고 부족 (≤1) 확인 모달 — 0, 음수, 1 케이스별 메시지 차등 */}
      {pending && (
        <Modal onClose={handleCancelPending}>
          <div className="flex flex-col gap-4 p-5 w-full max-w-[420px]">
            <div className="flex items-start gap-3">
              <span className="text-title2" aria-hidden>
                ⚠️
              </span>
              <div className="flex-1">
                <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  {pending.stock_quantity === 1
                    ? '마지막 1개 (전시상품 가능성)'
                    : pending.stock_quantity === 0
                      ? '재고 없음'
                      : `매입 대기 ${Math.abs(pending.stock_quantity ?? 0)}개 (입고 전)`}
                </h3>
                <p className="mt-1 text-callout text-[var(--color-label-secondary)]">
                  {pending.stock_quantity === 1
                    ? '전시·진열 상품일 수 있습니다. 고객 고지 후 진행하세요.'
                    : pending.stock_quantity === 0
                      ? '시스템 재고가 0 입니다. 실제 보유 여부를 확인하세요.'
                      : '아직 입고되지 않은 상품입니다. 판매 전 확인 필요.'}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-[var(--color-fill-quaternary)] p-3 text-callout">
              <div className="text-caption2 text-[var(--color-label-tertiary)]">
                {pending.brand_name}
              </div>
              <div className="font-semibold text-[var(--color-label-primary)]">
                {[pending.brand_name, pending.style_code, pending.color_code]
                  .filter(Boolean)
                  .join('/')}
              </div>
              {pending.sale_price !== null && (
                <div className="mt-1 text-caption1 tabular-nums text-[var(--color-label-secondary)]">
                  ₩{pending.sale_price.toLocaleString()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={handleCancelPending}
                className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleConfirmPending}
                className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-system-orange)] text-white font-semibold"
              >
                확인
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
});

// ── 디지트 버튼 ──────────────────────────────────────────────────────────────
interface DigitButtonProps {
  digit: string;
  letters?: string;
  onPress: (digit: string) => void;
}

const DigitButton = memo(function DigitButton({ digit, letters, onPress }: DigitButtonProps) {
  const handleClick = useCallback(() => onPress(digit), [digit, onPress]);
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={letters ? `${digit} (${letters})` : digit}
      className="pressable touch-target-lg rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-label-primary)] min-w-[72px] flex flex-col items-center justify-center leading-none gap-0.5 py-1"
    >
      <span className="text-title2 font-medium leading-none">{digit}</span>
      {letters ? (
        <span className="text-[9px] tracking-[0.08em] font-semibold text-[var(--color-label-tertiary)] leading-none">
          {letters}
        </span>
      ) : null}
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
