// Frame Ops Phase 2 — 결제 다이얼로그 (현금 + 카드 분할 + 담당자 비밀번호 재인증)
// 결제 확정 → 담당자 비밀번호 키패드 → /api/auth/verify-staff-password → onConfirm.
// state 격리: 다이얼로그 내부에 cash/card/password/error 보관, 부모는 확정 시 통보 받음.

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { NumberKeypad } from './NumberKeypad';
import { PasswordKeypad } from './PasswordKeypad';

export interface PaymentInput {
  cash: number;
  card: number;
  seller_user_id: string;
  seller_label: string;
}

export interface PaymentDialogProps {
  total: number;
  onConfirm: (payment: PaymentInput) => void;
  onCancel: () => void;
}

type Step = 'choose' | 'cash' | 'card' | 'password';

interface VerifyResponse {
  data: { staff_user_id: string; display_name: string | null; role_code: string } | null;
  error: string | null;
}

export const PaymentDialog = memo(function PaymentDialog({
  total,
  onConfirm,
  onCancel,
}: PaymentDialogProps) {
  const [step, setStep] = useState<Step>('choose');
  const [cash, setCash] = useState(0);
  const [card, setCard] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

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
      const clamped = Math.min(v, total);
      setCash(clamped);
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

  // "결제 확정" → 담당자 패스워드 단계로 전환
  const handleGoToPassword = useCallback(() => {
    if (!canConfirm) return;
    setPwError(null);
    setStep('password');
  }, [canConfirm]);

  // 패스워드 확인 → API 검증 → 성공 시 onConfirm 호출
  const handlePasswordConfirm = useCallback(
    async (password: string) => {
      setVerifying(true);
      setPwError(null);
      try {
        const res = await fetch('/api/auth/verify-staff-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const json = (await res.json()) as VerifyResponse;
        if (!res.ok || !json.data) {
          setPwError(json.error ?? '비밀번호가 일치하지 않습니다.');
          setVerifying(false);
          return;
        }
        onConfirm({
          cash,
          card,
          seller_user_id: json.data.staff_user_id,
          seller_label: json.data.display_name ?? '',
        });
      } catch (err) {
        setPwError(err instanceof Error ? err.message : '네트워크 오류');
        setVerifying(false);
      }
    },
    [cash, card, onConfirm]
  );

  const handlePasswordCancel = useCallback(() => {
    if (verifying) return;
    setPwError(null);
    setStep('choose');
  }, [verifying]);

  // 단계별 backdrop 닫기 핸들러 — verifying 중엔 닫지 않음
  const handleBackdropClose = useCallback(() => {
    if (verifying) return;
    if (step === 'choose') {
      // 결제 선택 단계: 닫기 = 취소 (실수 방지를 위해 disableEscape 유지)
      // backdrop click 으로는 닫지 않음 (PaymentDialog 의 의도된 보호)
      return;
    }
    setStep('choose');
  }, [step, verifying]);

  return (
    <Modal onClose={handleBackdropClose} disableEscape={verifying || step === 'choose'}>
      {/* 일관된 외곽: 모든 단계에서 동일 폭/최소 높이 유지 → 다이얼로그 사이즈 변동 방지 */}
      <div className="flex flex-col w-full max-w-[420px] min-h-[520px]">
        {step === 'choose' && (
          <div className="flex flex-col gap-4 p-5 flex-1">
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

            {/* 안내 영역 — 항상 같은 높이 유지 */}
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

            {/* 여백 (남은 공간을 액션 버튼 위로 밀어냄) */}
            <div className="flex-1" />

            {/* 취소 / 결제 확정 — touch-target-lg 통일 */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={onCancel}
                className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGoToPassword}
                disabled={!canConfirm}
                className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
              >
                결제 확정
              </button>
            </div>
          </div>
        )}

        {step === 'cash' && (
          <NumberKeypad
            initialValue={cash}
            label="현금 금액"
            maxValue={total}
            onConfirm={handleSetCash}
            onCancel={handleBackToChoose}
          />
        )}

        {step === 'card' && (
          <NumberKeypad
            initialValue={card}
            label="카드 금액"
            maxValue={total}
            onConfirm={handleSetCard}
            onCancel={handleBackToChoose}
          />
        )}

        {step === 'password' && (
          <PasswordKeypad
            label="담당자 비밀번호"
            errorMessage={pwError}
            busy={verifying}
            onConfirm={handlePasswordConfirm}
            onCancel={handlePasswordCancel}
          />
        )}
      </div>
    </Modal>
  );
});
