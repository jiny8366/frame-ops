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
}

export const CartView = memo(function CartView({
  items,
  onRemove,
  onIncrease,
  onDecrease,
  onEditDiscount,
}: CartViewProps) {
  // 고정 높이로 카트 영역을 안정화 (약 15행). 항목이 더 많으면 내부 스크롤.
  // 빈 상태도 같은 높이를 유지하여 결제·할인 버튼 위치가 흔들리지 않음.
  return (
    <div className="h-[40rem] overflow-auto rounded-xl bg-[var(--color-bg-secondary)]">
      {items.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[var(--color-label-tertiary)] text-callout">
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
          />
        ))
      )}
    </div>
  );
});
