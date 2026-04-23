// Frame Ops — Phase 2 공용 버튼
// .pressable CSS 유틸로 GPU 합성 기반 즉시 피드백 (50ms transform + opacity).
// React.memo + useCallback 로 부모 리렌더 전파 차단.

'use client';

import { memo, useCallback } from 'react';

export interface PressableButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  /** 'button' | 'submit' | 'reset' — 폼 안에서 사용 시 명시. */
  type?: 'button' | 'submit' | 'reset';
  /** 접근성 라벨 (아이콘만 있는 버튼용). */
  ariaLabel?: string;
}

export const PressableButton = memo(function PressableButton({
  onClick,
  children,
  className = '',
  disabled = false,
  type = 'button',
  ariaLabel,
}: PressableButtonProps) {
  const handleClick = useCallback(() => {
    if (!disabled) onClick();
  }, [onClick, disabled]);

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`pressable ${className}`}
    >
      {children}
    </button>
  );
});
