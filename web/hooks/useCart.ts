// Frame Ops Phase 2 — POS 장바구니 훅
// 장바구니는 페이지 단위 로컬 state. 결제 시점에 fo_sale_items shape 으로 변환.
// PHASE2_DESIGN_PATTERNS.md §5 (CartItem 재설계) 참조.

'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * 장바구니 라인 항목 — fo_sale_items DB shape 와 1:1 대응 (DB 저장 시 id 는 버려짐).
 * 표시용 캐시(style_code, display_name)는 판매 시점 스냅샷.
 */
export interface CartItem {
  id: string;              // 로컬 임시 ID
  product_id: string;
  brand_name: string;
  style_code: string;
  color_code: string;
  display_name: string;
  unit_price: number;      // 판매 시점 단가 고정
  quantity: number;
  discount_amount: number;
}

/** 검색 결과(Product 또는 RPC 결과)에서 장바구니에 담을 때 필요한 최소 필드. */
export interface CartProductSnapshot {
  id: string;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  sale_price: number | null;
  /** 재고. ≤1 이면 전시상품으로 보고 10% 자동 할인 적용. null/undefined 는 미관리(자동할인 적용 X). */
  stock_quantity?: number | null;
}

/** 재고가 1 이하인 전시상품에 적용되는 자동 할인 비율 (10%). */
const DISPLAY_STOCK_DISCOUNT_RATE = 0.1;

/** 단가 × 10% 를 100원 단위 내림하여 깔끔한 할인액 산출. */
function calcDisplayStockDiscount(unitPrice: number): number {
  if (unitPrice <= 0) return 0;
  return Math.floor((unitPrice * DISPLAY_STOCK_DISCOUNT_RATE) / 100) * 100;
}

export interface UseCartReturn {
  items: CartItem[];
  addItem: (product: CartProductSnapshot) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updateItemDiscount: (cartItemId: string, discount: number) => void;
  /** 라인의 부호를 뒤집음 — 반품 처리 (양수 → 음수, 음수 → 양수). */
  toggleReturn: (cartItemId: string) => void;
  clear: () => void;
  subtotal: number;
  itemDiscounts: number;
}

export function useCart(): UseCartReturn {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: CartProductSnapshot) => {
    setItems((prev) => {
      // 동일 product_id 면 수량만 증가 (할인은 기존 라인 값 유지)
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      // 재고 ≤1 (전시상품) → 10% 자동 할인
      const unitPrice = product.sale_price ?? 0;
      const isDisplayStock =
        product.stock_quantity != null && product.stock_quantity <= 1;
      const autoDiscount = isDisplayStock ? calcDisplayStockDiscount(unitPrice) : 0;
      return [
        ...prev,
        {
          id: `cart-${Date.now()}-${product.id}`,
          product_id: product.id,
          brand_name: product.brand_name ?? '',
          style_code: product.style_code ?? '',
          color_code: product.color_code ?? '',
          display_name: product.display_name ?? product.style_code ?? '',
          unit_price: unitPrice,
          quantity: 1,
          discount_amount: autoDiscount,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((cartItemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    // 정확히 0 일 때만 자동 제거. 음수는 반품 라인이므로 유지.
    if (quantity === 0) {
      setItems((prev) => prev.filter((i) => i.id !== cartItemId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === cartItemId ? { ...i, quantity } : i))
    );
  }, []);

  const toggleReturn = useCallback((cartItemId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === cartItemId ? { ...i, quantity: -i.quantity } : i
      )
    );
  }, []);

  const updateItemDiscount = useCallback((cartItemId: string, discount: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === cartItemId ? { ...i, discount_amount: Math.max(0, discount) } : i
      )
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const itemDiscounts = items.reduce((sum, i) => sum + i.discount_amount, 0);
    return { subtotal, itemDiscounts };
  }, [items]);

  return {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateItemDiscount,
    toggleReturn,
    clear,
    ...totals,
  };
}
