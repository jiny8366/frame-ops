// Frame Ops Phase 2 — 장바구니 행
// 모바일: 2 줄 (위=브랜드/스타일/컬러+✕, 아래=[-] 수량 [+] · 금액)
// 데스크톱(sm+): 1 줄 (브랜드/스타일/컬러 · 단가 · 할인 · ± 수량 · 금액 · ✕)

'use client';

import { memo, useCallback } from 'react';
import type { CartItem as CartItemData } from '@/hooks/useCart';

export interface CartItemProps {
  item: CartItemData;
  onRemove: (cartItemId: string) => void;
  onIncrease: (cartItemId: string, currentQty: number) => void;
  onDecrease: (cartItemId: string, currentQty: number) => void;
  onEditDiscount: (cartItemId: string) => void;
}

export const CartItem = memo(function CartItem({
  item,
  onRemove,
  onIncrease,
  onDecrease,
  onEditDiscount,
}: CartItemProps) {
  const handleRemove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  const handleInc = useCallback(
    () => onIncrease(item.id, item.quantity),
    [item.id, item.quantity, onIncrease]
  );
  const handleDec = useCallback(
    () => onDecrease(item.id, item.quantity),
    [item.id, item.quantity, onDecrease]
  );
  const handleDiscount = useCallback(
    () => onEditDiscount(item.id),
    [item.id, onEditDiscount]
  );

  const lineTotal = item.unit_price * item.quantity - item.discount_amount;
  const titleText =
    [item.brand_name, item.style_code, item.color_code]
      .map((s) => (s ?? '').trim())
      .filter((s) => s.length > 0)
      .join('/') || '—';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 border-b border-[var(--color-separator-opaque)] last:border-b-0">
      {/* ── 1행 (모바일·데스크톱 공통): 브랜드/스타일/컬러 + (모바일) 삭제 ── */}
      <div className="flex items-center gap-2 sm:flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="text-callout font-medium text-[var(--color-label-primary)] truncate">
            {titleText}
          </div>
          {/* 데스크톱에서만: 단가·할인 캡션 */}
          <div className="hidden sm:flex items-baseline gap-2 mt-0.5 text-caption1 text-[var(--color-label-secondary)]">
            <span>₩{item.unit_price.toLocaleString()}</span>
            <span>·</span>
            <button
              type="button"
              onClick={handleDiscount}
              className="pressable underline-offset-2 hover:underline"
            >
              할인 ₩{item.discount_amount.toLocaleString()}
            </button>
          </div>
        </div>
        {/* 모바일 전용 삭제 버튼 (1행 우측) */}
        <button
          type="button"
          onClick={handleRemove}
          aria-label="삭제"
          className="pressable touch-target text-[var(--color-system-red)] sm:hidden"
        >
          ✕
        </button>
      </div>

      {/* ── 2행 (모바일) / 우측 컨트롤 (데스크톱): [-] 수량 [+] + 금액 ── */}
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        {/* 수량 ± */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleDec}
            aria-label="수량 감소"
            className="pressable touch-target rounded-lg w-8 h-8 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
          >
            −
          </button>
          <span className="w-8 text-center text-callout font-semibold tabular-nums">
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={handleInc}
            aria-label="수량 증가"
            className="pressable touch-target rounded-lg w-8 h-8 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
          >
            +
          </button>
        </div>

        <span className="w-24 sm:w-24 text-right text-callout font-semibold tabular-nums">
          ₩{lineTotal.toLocaleString()}
        </span>

        {/* 데스크톱 전용 삭제 버튼 (우측 끝) */}
        <button
          type="button"
          onClick={handleRemove}
          aria-label="삭제"
          className="pressable touch-target text-[var(--color-system-red)] hidden sm:block"
        >
          ✕
        </button>
      </div>
    </div>
  );
});
