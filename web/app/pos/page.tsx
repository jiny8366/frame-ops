// Frame Ops Phase 2 — POS 메인 화면
// 좌: 제품 검색, 우: 장바구니 + 가격 + 액션. 다이얼로그는 격리 state.
// 인증: useSession 으로 store_id 자동 주입. 결제 확정 시 담당자 비밀번호 재인증.

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
import { useSession } from '@/hooks/useSession';

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function PosPage() {
  const cart = useCart();
  const { submit } = useCheckout();
  const { session } = useSession();

  const storeId = session?.store_id ?? '';

  const [discountOpen, setDiscountOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [saleDate, setSaleDate] = useState<string>(todayIso());

  const total = useMemo(
    () => Math.max(0, cart.subtotal - cart.itemDiscounts - globalDiscount),
    [cart.subtotal, cart.itemDiscounts, globalDiscount]
  );

  // ── 장바구니 핸들러 ──────────────────────────────────────────────────────
  const handleAddProduct = useCallback(
    (product: CartProductSnapshot) => cart.addItem(product),
    [cart]
  );

  const handleIncrease = useCallback(
    (cartItemId: string, currentQty: number) => cart.updateQuantity(cartItemId, currentQty + 1),
    [cart]
  );

  const handleDecrease = useCallback(
    (cartItemId: string, currentQty: number) => cart.updateQuantity(cartItemId, currentQty - 1),
    [cart]
  );

  const handleEditItemDiscount = useCallback(
    (cartItemId: string) => setEditingItemId(cartItemId),
    []
  );

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

  const handleSaleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSaleDate(e.target.value || todayIso());
  }, []);

  // 선택 날짜 → ISO timestamp (선택 날짜의 현재 시:분:초 사용)
  const buildSoldAt = useCallback((dateStr: string): string | null => {
    if (!dateStr || dateStr === todayIso()) return null;
    const now = new Date();
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1, now.getHours(), now.getMinutes(), now.getSeconds());
    return dt.toISOString();
  }, []);

  const handleCheckout = useCallback(
    async (payment: PaymentInput) => {
      setPaymentOpen(false);
      const ok = await submit({
        store_id: storeId,
        items: cart.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_amount: i.discount_amount,
        })),
        cash_amount: payment.cash,
        card_amount: payment.card,
        discount_total: cart.itemDiscounts + globalDiscount,
        seller_user_id: payment.seller_user_id,
        seller_label: payment.seller_label,
        sold_at: buildSoldAt(saleDate),
        idempotency_key: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });

      // 성공 시에만 카트 비움. 실패면 사용자가 재시도 가능.
      if (ok) {
        cart.clear();
        setGlobalDiscount(0);
        setSaleDate(todayIso());
      }
    },
    [cart, globalDiscount, submit, storeId, saleDate, buildSoldAt]
  );

  const editingItem = useMemo(
    () => (editingItemId ? cart.items.find((i) => i.id === editingItemId) ?? null : null),
    [editingItemId, cart.items]
  );

  const isToday = saleDate === todayIso();

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding">
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-4 p-4 h-screen">
        {/* 좌측: 제품 검색 */}
        <section className="flex flex-col gap-3 min-h-0">
          <ProductSearch onSelect={handleAddProduct} />
        </section>

        {/* 우측: 장바구니 + 가격 + 액션 */}
        <section className="flex flex-col gap-3 min-h-0">
          {/* 헤더: 지점명 + 판매일자 picker */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-title3 font-bold text-[var(--color-label-primary)] truncate">
                {session?.store_name ?? 'POS 판매'}
              </h1>
              {session && (
                <span className="text-caption1 text-[var(--color-label-tertiary)]">
                  {session.store_code}
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 shrink-0">
              <span className="text-caption1 text-[var(--color-label-secondary)]">판매일자</span>
              <input
                type="date"
                value={saleDate}
                onChange={handleSaleDateChange}
                max={todayIso()}
                className={`rounded-lg border px-2 py-1 text-callout tabular-nums ${
                  isToday
                    ? 'border-[var(--color-separator-opaque)] bg-[var(--color-bg-secondary)]'
                    : 'border-[var(--color-system-orange)] bg-[var(--color-bg-secondary)]'
                }`}
              />
            </label>
          </div>

          {!isToday && (
            <p className="text-caption1 text-[var(--color-system-orange)]">
              ⚠️ 과거 날짜로 판매가 기록됩니다 (백데이팅)
            </p>
          )}

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
              disabled={cart.items.length === 0 || total <= 0 || !storeId}
              className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
            >
              결제 ({total.toLocaleString()}원)
            </button>
          </div>
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
