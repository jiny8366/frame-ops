// Frame Ops Phase 2 — POS 메인 화면
// 좌: 장바구니 + 가격 + 액션, 우: 제품 검색.
// 다이얼로그(할인/항목할인/결제)는 격리된 state.

'use client';

import { useCallback, useMemo, useState } from 'react';
import { CartView } from './components/CartView';
import { PriceSummary } from './components/PriceSummary';
import { ProductSearch } from './components/ProductSearch';
import { DiscountDialog } from './components/DiscountDialog';
import { ItemDiscountDialog } from './components/QuantityDialog';
import { PaymentDialog, type PaymentInput } from './components/PaymentDialog';
import { useCart, type CartProductSnapshot } from '@/hooks/useCart';
import { useCheckout } from '@/hooks/useCheckout';

// ⚠️ 임시: 단일 매장 가정. store_id 를 환경변수로 주입.
//    멀티매장 셀렉터 / 매장-기반 RLS 는 Phase 3 에서 추가.
const STORE_ID = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID ?? '';

export default function PosPage() {
  const cart = useCart();
  const { submit } = useCheckout();

  // ── 다이얼로그 open 상태 (확정값/임시값 분리) ─────────────────────────────
  const [discountOpen, setDiscountOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);

  const total = useMemo(
    () => Math.max(0, cart.subtotal - cart.itemDiscounts - globalDiscount),
    [cart.subtotal, cart.itemDiscounts, globalDiscount]
  );

  // ── 장바구니 핸들러 ──────────────────────────────────────────────────────
  const handleAddProduct = useCallback(
    (product: CartProductSnapshot) => {
      cart.addItem(product);
    },
    [cart]
  );

  const handleIncrease = useCallback(
    (cartItemId: string, currentQty: number) => {
      cart.updateQuantity(cartItemId, currentQty + 1);
    },
    [cart]
  );

  const handleDecrease = useCallback(
    (cartItemId: string, currentQty: number) => {
      cart.updateQuantity(cartItemId, currentQty - 1);
    },
    [cart]
  );

  const handleEditItemDiscount = useCallback((cartItemId: string) => {
    setEditingItemId(cartItemId);
  }, []);

  const handleConfirmItemDiscount = useCallback(
    (value: number) => {
      if (editingItemId) cart.updateItemDiscount(editingItemId, value);
      setEditingItemId(null);
    },
    [cart, editingItemId]
  );

  const handleCancelItemDiscount = useCallback(() => setEditingItemId(null), []);

  // ── 전체 할인 ────────────────────────────────────────────────────────────
  const handleOpenDiscount = useCallback(() => setDiscountOpen(true), []);
  const handleCloseDiscount = useCallback(() => setDiscountOpen(false), []);
  const handleConfirmDiscount = useCallback((value: number) => {
    setGlobalDiscount(value);
    setDiscountOpen(false);
  }, []);

  // ── 결제 ─────────────────────────────────────────────────────────────────
  const handleOpenPayment = useCallback(() => setPaymentOpen(true), []);
  const handleClosePayment = useCallback(() => setPaymentOpen(false), []);

  const handleCheckout = useCallback(
    async (payment: PaymentInput) => {
      setPaymentOpen(false);

      await submit({
        store_id: STORE_ID,
        items: cart.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_amount: i.discount_amount,
        })),
        cash_amount: payment.cash,
        card_amount: payment.card,
        discount_total: cart.itemDiscounts + globalDiscount,
        idempotency_key: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });

      // Optimistic 으로 이미 router.push('/') 실행되지만, 카트는 비워야 함
      cart.clear();
      setGlobalDiscount(0);
    },
    [cart, globalDiscount, submit]
  );

  const editingItem = useMemo(
    () => (editingItemId ? cart.items.find((i) => i.id === editingItemId) ?? null : null),
    [editingItemId, cart.items]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding">
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-4 p-4 h-screen">
        {/* 좌측: 제품 검색 + 결과 */}
        <section className="flex flex-col gap-3 min-h-0">
          <ProductSearch onSelect={handleAddProduct} />
        </section>

        {/* 우측: 장바구니 + 가격 + 액션 */}
        <section className="flex flex-col gap-3 min-h-0">
          <h1 className="text-title3 font-bold text-[var(--color-label-primary)]">
            POS 판매
          </h1>

          <CartView
            items={cart.items}
            onRemove={cart.removeItem}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
            onEditDiscount={handleEditItemDiscount}
          />

          <PriceSummary
            subtotal={cart.subtotal}
            discount={cart.itemDiscounts + globalDiscount}
            total={total}
          />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleOpenDiscount}
              disabled={cart.items.length === 0}
              className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-40"
            >
              할인
            </button>
            <button
              type="button"
              onClick={handleOpenPayment}
              disabled={cart.items.length === 0 || total <= 0 || !STORE_ID}
              className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
            >
              결제 ({total.toLocaleString()}원)
            </button>
          </div>

          {!STORE_ID && (
            <p className="text-caption1 text-[var(--color-system-orange)]">
              ⚠️ NEXT_PUBLIC_DEFAULT_STORE_ID 환경변수가 설정되지 않아 결제 비활성됩니다
            </p>
          )}
        </section>
      </div>

      {/* 다이얼로그들: 내부 state 격리 */}
      {discountOpen && (
        <DiscountDialog
          initialValue={globalDiscount}
          maxValue={cart.subtotal - cart.itemDiscounts}
          onConfirm={handleConfirmDiscount}
          onCancel={handleCloseDiscount}
        />
      )}

      {editingItem && (
        <ItemDiscountDialog
          initialValue={editingItem.discount_amount}
          maxValue={editingItem.unit_price * editingItem.quantity}
          onConfirm={handleConfirmItemDiscount}
          onCancel={handleCancelItemDiscount}
        />
      )}

      {paymentOpen && (
        <PaymentDialog
          total={total}
          onConfirm={handleCheckout}
          onCancel={handleClosePayment}
        />
      )}
    </main>
  );
}
