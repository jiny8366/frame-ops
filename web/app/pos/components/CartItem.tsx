// Frame Ops Phase 2 — 장바구니 행
// memo + useCallback 로 한 행 변경이 다른 행 리렌더 유발 안 함.

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

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-separator-opaque)] last:border-b-0">
      <div className="flex-1 min-w-0">
        {/* {브랜드}/{제품번호}/{컬러} 한 줄. display_name (레거시) 은 사용하지 않음. */}
        <div className="text-callout font-medium text-[var(--color-label-primary)] truncate">
          {[item.brand_name, item.style_code, item.color_code]
            .map((s) => (s ?? '').trim())
            .filter((s) => s.length > 0)
            .join('/') || '—'}
        </div>
        <div className="flex items-baseline gap-2 mt-0.5 text-caption1 text-[var(--color-label-secondary)]">
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

      {/* 수량 ± */}
      <div className="flex items-center gap-1">
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

      <span className="w-24 text-right text-callout font-semibold tabular-nums">
        ₩{lineTotal.toLocaleString()}
      </span>

      <button
        type="button"
        onClick={handleRemove}
        aria-label="삭제"
        className="pressable touch-target text-[var(--color-system-red)]"
      >
        ✕
      </button>
    </div>
  );
});
