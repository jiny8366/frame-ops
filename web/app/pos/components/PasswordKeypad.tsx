// Frame Ops Phase 2 — 비밀번호 입력 숫자 키패드 (state 격리)
// 자리수 제한 없음. 입력은 마스킹(●). onConfirm 시 평문 password 문자열 전달.

'use client';

import { memo, useCallback, useState } from 'react';

export interface PasswordKeypadProps {
  label?: string;
  errorMessage?: string | null;
  busy?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export const PasswordKeypad = memo(function PasswordKeypad({
  label = '담당자 비밀번호',
  errorMessage,
  busy,
  onConfirm,
  onCancel,
}: PasswordKeypadProps) {
  const [value, setValue] = useState('');

  const handleDigit = useCallback((digit: string) => {
    setValue((prev) => (prev.length >= 32 ? prev : prev + digit));
  }, []);

  const handleBackspace = useCallback(() => {
    setValue((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => setValue(''), []);

  const handleConfirm = useCallback(() => {
    if (!value) return;
    onConfirm(value);
  }, [value, onConfirm]);

  const masked = '●'.repeat(value.length) || ' ';

  return (
    <div className="keypad-root flex flex-col gap-3 p-5 w-full max-w-[420px] flex-1">
      <div className="keypad-display flex flex-col items-end gap-1 px-3 py-3 rounded-xl bg-[var(--color-fill-tertiary)]">
        <span className="text-caption2 text-[var(--color-label-secondary)]">{label}</span>
        <span className="text-title1 font-semibold tracking-[0.2em] text-[var(--color-label-primary)] min-h-[1.5em]">
          {masked}
        </span>
      </div>

      {errorMessage && (
        <p className="text-caption1 text-[var(--color-system-red)] text-center">{errorMessage}</p>
      )}

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

      <div className="flex-1" />

      <div className="keypad-actions grid grid-cols-2 gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || value.length === 0}
          className="pressable touch-target-lg rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
        >
          {busy ? '확인 중…' : '확인'}
        </button>
      </div>
    </div>
  );
});

interface KeypadButtonProps {
  digit: string;
  onPress: (digit: string) => void;
}
const KeypadButton = memo(function KeypadButton({ digit, onPress }: KeypadButtonProps) {
  const handleClick = useCallback(() => onPress(digit), [digit, onPress]);
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

interface KeypadActionButtonProps {
  label: string;
  onPress: () => void;
}
const KeypadActionButton = memo(function KeypadActionButton({ label, onPress }: KeypadActionButtonProps) {
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
