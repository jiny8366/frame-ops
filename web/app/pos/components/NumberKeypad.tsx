// Frame Ops Phase 2 — 숫자 키패드 (state 격리)
// PHASE2_DESIGN_PATTERNS.md §1 — initialValue + onConfirm/onCancel 계약 준수.
// state 는 컴포넌트 내부에만. 부모는 확정 시점에만 onConfirm 으로 통보 받음.

'use client';

import { memo, useCallback, useState } from 'react';

export interface NumberKeypadProps {
  initialValue?: number;
  label?: string;
  /** 입력 가능한 최대값. 초과 시 그 자리 무시. 예: 카트 소계로 할인 상한. */
  maxValue?: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}

const QUICK_AMOUNTS = [10000, 50000, 100000];

export const NumberKeypad = memo(function NumberKeypad({
  initialValue = 0,
  label = '금액 입력',
  maxValue,
  onConfirm,
  onCancel,
}: NumberKeypadProps) {
  // ⭐ state 는 여기에만 — 부모 리렌더 안 됨
  const [value, setValue] = useState<string>(String(initialValue));

  const handleDigit = useCallback(
    (digit: string) => {
      setValue((prev) => {
        const next = prev === '0' ? digit : prev + digit;
        if (next.length > 10) return prev;
        if (maxValue !== undefined && parseInt(next, 10) > maxValue) return prev;
        return next;
      });
    },
    [maxValue]
  );

  const handleBackspace = useCallback(() => {
    setValue((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);

  const handleClear = useCallback(() => setValue('0'), []);

  const handleAddQuick = useCallback(
    (amount: number) => {
      setValue((prev) => {
        const next = (parseInt(prev, 10) || 0) + amount;
        if (maxValue !== undefined && next > maxValue) return String(maxValue);
        return String(next);
      });
    },
    [maxValue]
  );

  const handleConfirm = useCallback(() => {
    onConfirm(parseInt(value, 10) || 0);
  }, [value, onConfirm]);

  const numericValue = parseInt(value, 10) || 0;

  return (
    <div className="keypad-root flex flex-col gap-3 p-5 w-full max-w-[420px] flex-1">
      {/* LCD 디스플레이 */}
      <div className="keypad-display flex flex-col items-end gap-1 px-3 py-3 rounded-xl bg-[var(--color-fill-tertiary)]">
        <span className="text-caption2 text-[var(--color-label-secondary)]">
          {label}
        </span>
        <span className="text-title1 font-semibold tabular-nums text-[var(--color-label-primary)]">
          ₩{numericValue.toLocaleString()}
        </span>
      </div>

      {/* 숫자 키패드 — 3x4 그리드 */}
      <div className="keypad-grid grid grid-cols-3 gap-2">
        <KeypadButton digit="1" onPress={handleDigit} />
        <KeypadButton digit="2" onPress={handleDigit} />
        <KeypadButton digit="3" onPress={handleDigit} />
        <KeypadButton digit="4" onPress={handleDigit} />
        <KeypadButton digit="5" onPress={handleDigit} />
        <KeypadButton digit="6" onPress={handleDigit} />
        <KeypadButton digit="7" onPress={handleDigit} />
        <KeypadButton digit="8" onPress={handleDigit} />
        <KeypadButton digit="9" onPress={handleDigit} />
        <KeypadActionButton label="지움" onPress={handleClear} />
        <KeypadButton digit="0" onPress={handleDigit} />
        <KeypadActionButton label="⌫" onPress={handleBackspace} />
      </div>

      {/* 퀵 추가 (1만 / 5만 / 10만) */}
      <div className="keypad-quick grid grid-cols-3 gap-2">
        {QUICK_AMOUNTS.map((amt) => (
          <QuickAddButton key={amt} amount={amt} onPress={handleAddQuick} />
        ))}
      </div>

      {/* 여백 — 액션 버튼 하단 고정 */}
      <div className="flex-1" />

      {/* 취소 / 확인 — touch-target-lg 통일 */}
      <div className="keypad-actions grid grid-cols-2 gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold"
        >
          확인
        </button>
      </div>
    </div>
  );
});

// ── 개별 디지트 버튼 — memo + useCallback 으로 인접 버튼 영향 차단 ─────────────
interface KeypadButtonProps {
  digit: string;
  onPress: (digit: string) => void;
}

const KeypadButton = memo(function KeypadButton({ digit, onPress }: KeypadButtonProps) {
  const handleClick = useCallback(() => {
    onPress(digit);
  }, [digit, onPress]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="pressable touch-target-lg rounded-xl bg-[var(--color-bg-secondary)] text-title2 font-medium text-[var(--color-label-primary)]"
    >
      {digit}
    </button>
  );
});

// ── 액션 버튼 (지움/⌫) — 시각적 구분 ─────────────────────────────────────────
interface KeypadActionButtonProps {
  label: string;
  onPress: () => void;
}

const KeypadActionButton = memo(function KeypadActionButton({
  label,
  onPress,
}: KeypadActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="pressable touch-target-lg rounded-xl bg-[var(--color-fill-secondary)] text-headline font-medium text-[var(--color-label-secondary)]"
    >
      {label}
    </button>
  );
});

// ── 퀵 추가 버튼 ─────────────────────────────────────────────────────────────
interface QuickAddButtonProps {
  amount: number;
  onPress: (amount: number) => void;
}

const QuickAddButton = memo(function QuickAddButton({ amount, onPress }: QuickAddButtonProps) {
  const handleClick = useCallback(() => {
    onPress(amount);
  }, [amount, onPress]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="pressable touch-target rounded-xl bg-[var(--color-fill-secondary)] text-callout font-medium text-[var(--color-label-secondary)]"
    >
      +{(amount / 10000).toFixed(0)}만
    </button>
  );
});
