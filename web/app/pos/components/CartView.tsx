// Frame Ops Phase 2 — 장바구니 영역
// 비어있을 때 안내, 항목 있으면 CartItem 리스트.

'use client';

import { memo } from 'react';
import { CartItem } from './CartItem';
import type { CartItem as CartItemData } from '@/hooks/useCart';

export interface CartViewProps {
  items: CartItemData[];
  onRemove: (cartItemId: string) => void;
  onIncrease: (cartItemId: string, currentQty: number) => void;
  onDecrease: (cartItemId: string, currentQty: number) => void;
  onEditDiscount: (cartItemId: string) => void;
  onToggleReturn: (cartItemId: string) => void;
}

export const CartView = memo(function CartView({
  items,
  onRemove,
  onIncrease,
  onDecrease,
  onEditDiscount,
  onToggleReturn,
}: CartViewProps) {
  return (
    <div className="max-h-[20rem] overflow-auto rounded-xl bg-[var(--color-bg-secondary)]">
      {items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-[var(--color-label-tertiary)] text-callout">
          좌측에서 제품을 선택해 담아주세요
        </div>
      ) : (
        items.map((item) => (
          <CartItem
            key={item.id}
            item={item}
            onRemove={onRemove}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            onEditDiscount={onEditDiscount}
            onToggleReturn={onToggleReturn}
          />
        ))
      )}
    </div>
  );
});
