// Frame Ops Phase 2 — 할인 입력 다이얼로그
// NumberKeypad 래핑. state 격리는 NumberKeypad 가 담당.

'use client';

import { memo } from 'react';
import { Modal } from './Modal';
import { NumberKeypad } from './NumberKeypad';

export interface DiscountDialogProps {
  initialValue: number;
  /** 입력 가능한 최대 할인액 (보통 카트 소계). */
  maxValue: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export const DiscountDialog = memo(function DiscountDialog({
  initialValue,
  maxValue,
  onConfirm,
  onCancel,
}: DiscountDialogProps) {
  return (
    <Modal onClose={onCancel}>
      <NumberKeypad
        initialValue={initialValue}
        label="할인 금액"
        maxValue={maxValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  );
});
