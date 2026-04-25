// Frame Ops Phase 2 — 수량 변경 다이얼로그 (장바구니 행 항목별 할인 입력)
// CartItem 의 할인 입력에 재사용. 수량 자체는 +/- 버튼으로 처리되므로 이 다이얼로그는 할인 전용.

'use client';

import { memo } from 'react';
import { Modal } from './Modal';
import { NumberKeypad } from './NumberKeypad';

export interface ItemDiscountDialogProps {
  initialValue: number;
  maxValue: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

export const ItemDiscountDialog = memo(function ItemDiscountDialog({
  initialValue,
  maxValue,
  onConfirm,
  onCancel,
}: ItemDiscountDialogProps) {
  return (
    <Modal onClose={onCancel}>
      <NumberKeypad
        initialValue={initialValue}
        label="이 항목 할인"
        maxValue={maxValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  );
});
