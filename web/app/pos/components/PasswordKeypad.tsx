// Frame Ops Phase 2 — 비밀번호 입력 숫자 키패드 (state 격리)
// 자리수 제한 없음. 입력은 마스킹(●). onConfirm 시 평문 password 문자열 전달.
// 데스크톱: 하드웨어 키보드 입력도 지원 (0-9, A-Z, Backspace, Enter, Escape).

'use client';

import { memo, useCallback, useEffect, useState } from 'react';

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

  // 데스크톱 하드웨어 키보드 입력 지원 — modal 떠 있는 동안 keydown 캡처.
  // 허용: 0-9, A-Z (대소문자 모두), Backspace, Enter (확인), Escape (취소)
  // 차단: 그 외 키 (조합키 포함). 입력 폼이 따로 없어 IME 우려 없음.
  // 의존 최소화 — 매 키 입력마다 리스너 재등록 방지를 위해 함수형 setState 로 현재값 접근.
  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        // 현재 값을 함수형으로 읽고 변경 없이 onConfirm 트리거
        setValue((current) => {
          if (current.length > 0) onConfirm(current);
          return current;
        });
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setValue((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key.length !== 1) return;
      if (/^[0-9a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        setValue((prev) => (prev.length >= 32 ? prev : prev + e.key.toUpperCase()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onConfirm, onCancel]);

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
