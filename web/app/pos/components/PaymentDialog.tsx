// Frame Ops Phase 2 — 결제 다이얼로그 (현금 + 카드 분할 입력)
// 내부에서 두 NumberKeypad 를 순차 호출. 합계가 total 과 일치하지 않으면 확인 비활성.

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { NumberKeypad } from './NumberKeypad';

export interface PaymentInput {
  cash: number;
  card: number;
}

export interface PaymentDialogProps {
  total: number;
  onConfirm: (payment: PaymentInput) => void;
  onCancel: () => void;
}

type Step = 'choose' | 'cash' | 'card';

export const PaymentDialog = memo(function PaymentDialog({
  total,
  onConfirm,
  onCancel,
}: PaymentDialogProps) {
  // ⭐ state 는 다이얼로그 내부에만
  const [step, setStep] = useState<Step>('choose');
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);

  const remaining = useMemo(() => Math.max(0, total - cash - card), [total, cash, card]);
  const canConfirm = cash + card === total && total > 0;

  const handleAllCash = useCallback(() => {
    setCash(total);
    setCard(0);
  }, [total]);

  const handleAllCard = useCallback(() => {
    setCard(total);
    setCash(0);
  }, [total]);

  const handleEditCash = useCallback(() => setStep('cash'), []);
  const handleEditCard = useCallback(() => setStep('card'), []);
  const handleBackToChoose = useCallback(() => setStep('choose'), []);

  const handleSetCash = useCallback(
    (v: number) => {
      // 합계 초과 방지
      const clamped = Math.min(v, total);
      setCash(clamped);
      // 잔액을 카드로 자동 채움
      setCard(Math.max(0, total - clamped));
      setStep('choose');
    },
    [total]
  );

  const handleSetCard = useCallback(
    (v: number) => {
      const clamped = Math.min(v, total);
      setCard(clamped);
      setCash(Math.max(0, total - clamped));
      setStep('choose');
    },
    [total]
  );

  const handleConfirm = useCallback(() => {
    if (canConfirm) onConfirm({ cash, card });
  }, [canConfirm, cash, card, onConfirm]);

  if (step === 'cash') {
    return (
      <Modal onClose={handleBackToChoose}>
        <NumberKeypad
          initialValue={cash}
          label="현금 금액"
          maxValue={total}
          onConfirm={handleSetCash}
          onCancel={handleBackToChoose}
        />
      </Modal>
    );
  }
  if (step === 'card') {
    return (
      <Modal onClose={handleBackToChoose}>
        <NumberKeypad
          initialValue={card}
          label="카드 금액"
          maxValue={total}
          onConfirm={handleSetCard}
          onCancel={handleBackToChoose}
        />
      </Modal>
    );
  }

  return (
    <Modal onClose={onCancel} disableEscape>
      <div className="flex flex-col gap-4 p-5 w-full max-w-[420px]">
        <div className="flex items-baseline justify-between">
          <span className="text-headline text-[var(--color-label-primary)]">결제</span>
          <span className="text-title2 font-bold tabular-nums">
            ₩{total.toLocaleString()}
          </span>
        </div>

        {/* 빠른 결제 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleAllCash}
            className="pressable touch-target-lg rounded-xl bg-[var(--color-fill-secondary)] py-3 text-callout font-medium"
          >
            전액 현금
          </button>
          <button
            type="button"
            onClick={handleAllCard}
            className="pressable touch-target-lg rounded-xl bg-[var(--color-fill-secondary)] py-3 text-callout font-medium"
          >
            전액 카드
          </button>
        </div>

        {/* 분할 표시 + 편집 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)]">
          <button
            type="button"
            onClick={handleEditCash}
            className="pressable w-full flex items-baseline justify-between p-3 border-b border-[var(--color-separator-opaque)] text-left"
          >
            <span className="text-callout text-[var(--color-label-secondary)]">현금</span>
            <span className="text-callout font-semibold tabular-nums">
              ₩{cash.toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            onClick={handleEditCard}
            className="pressable w-full flex items-baseline justify-between p-3 text-left"
          >
            <span className="text-callout text-[var(--color-label-secondary)]">카드</span>
            <span className="text-callout font-semibold tabular-nums">
              ₩{card.toLocaleString()}
            </span>
          </button>
        </div>

        {/* 안내 영역 — 항상 같은 높이 유지 (다이얼로그 크기 안정화) */}
        <p
          className={`text-caption1 text-center min-h-[1.25rem] ${
            remaining > 0
              ? 'text-[var(--color-system-orange)]'
              : cash + card > total
                ? 'text-[var(--color-system-red)]'
                : 'invisible'
          }`}
        >
          {remaining > 0
            ? `남은 금액 ₩${remaining.toLocaleString()} 만큼 더 분할해주세요`
            : cash + card > total
              ? `합계가 ₩${(cash + card - total).toLocaleString()} 만큼 초과됐습니다`
              : '·'}
        </p>

        {/* 취소 / 확정 */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            결제 확정
          </button>
        </div>
      </div>
    </Modal>
  );
});
