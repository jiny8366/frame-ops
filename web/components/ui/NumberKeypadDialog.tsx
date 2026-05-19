// Frame Ops Web — 공통 숫자 키패드 다이얼로그
//
// 기존: 재고 조회의 StockEditDialog 내부 키패드만 사용 → 매입 등록 등 다른 곳은
//       <input type="number" /> 사용 → 모바일 숫자 키패드에는 '-' 가 없어
//       음수(반품) 입력 불가.
//
// 변경: 공통 다이얼로그로 추출하여 어디서든 동일한 키패드 UX 제공.
//       '지움' 버튼을 '±' (부호 전환) 으로 교체 → 모바일에서도 음수 입력 가능.
//
// 사용처:
//   - 재고 조회 (StockEditDialog) — 재고 음수 허용
//   - 매입 등록 (lines.quantity) — 반품(음수) 처리
//   - 매입 내역 편집 (EditReceiptDialog)
//   - 기타 수량 입력이 필요한 모든 곳

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface NumberKeypadDialogProps {
  /** 다이얼로그 제목 (예: '재고 수량 수정', '매입 수량') */
  title: string;
  /** 부제 (예: 상품명 + 컬러). 한 줄 truncate. */
  subtitle?: string;
  /** 현재 값. 다이얼로그 mount 시 이 값으로 시작. */
  value: number;
  /** 현재 값과 동일하면 저장 비활성. label 표시 안 함. */
  baselineLabel?: string;
  /** ± 키 노출. true 면 음수 입력 가능. 기본 true. */
  allowNegative?: boolean;
  /** 절대값 자릿수 제한 (기본 5 — 99,999 까지). */
  maxDigits?: number;
  /** 저장 액션 라벨. 기본 '저장'. */
  saveLabel?: string;
  /** 저장 시 호출. true 반환 시 다이얼로그 자동 닫힘. */
  onSave: (next: number) => void | boolean | Promise<void | boolean>;
  /** 취소/닫기. */
  onClose: () => void;
}

export function NumberKeypadDialog({
  title,
  subtitle,
  value,
  baselineLabel,
  allowNegative = true,
  maxDigits = 5,
  saveLabel = '저장',
  onSave,
  onClose,
}: NumberKeypadDialogProps) {
  // 부호와 절대값을 분리 관리 → 부호 토글이 0 이어도 안전 (다음 입력에 사용).
  const [isNeg, setIsNeg] = useState<boolean>(value < 0);
  const [absStr, setAbsStr] = useState<string>(String(Math.abs(value)));
  const [submitting, setSubmitting] = useState(false);
  // 첫 키 입력은 기존 값 대체.
  const freshRef = useRef(true);
  const userEditedRef = useRef(false);

  // value prop 변경 (외부에서 다른 라인으로 전환 등) 시 reset
  useEffect(() => {
    userEditedRef.current = false;
    setIsNeg(value < 0);
    setAbsStr(String(Math.abs(value)));
    freshRef.current = true;
  }, [value]);

  // Esc 닫기
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, submitting]);

  const append = useCallback(
    (d: string) => {
      userEditedRef.current = true;
      setAbsStr((prev) => {
        if (freshRef.current) {
          freshRef.current = false;
          return d;
        }
        const next = (prev === '0' ? '' : prev) + d;
        return next.slice(0, maxDigits);
      });
    },
    [maxDigits]
  );
  const backspace = useCallback(() => {
    userEditedRef.current = true;
    freshRef.current = false;
    setAbsStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);
  const toggleSign = useCallback(() => {
    userEditedRef.current = true;
    freshRef.current = false;
    setIsNeg((p) => !p);
  }, []);

  const absNum = Number(absStr) || 0;
  const displayNum = isNeg ? -absNum : absNum;
  const dirty = displayNum !== value;

  const handleSave = useCallback(async () => {
    if (!dirty || submitting) return;
    setSubmitting(true);
    try {
      const result = await onSave(displayNum);
      // onSave 가 명시적 false 반환 시 닫지 않음 (검증 실패 등). 기본은 닫음.
      if (result !== false) onClose();
    } finally {
      setSubmitting(false);
    }
  }, [dirty, submitting, displayNum, onSave, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-[360px] rounded-2xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
        <header>
          <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
            {title}
          </h3>
          {subtitle && (
            <p className="text-caption1 text-[var(--color-label-secondary)] truncate">
              {subtitle}
            </p>
          )}
        </header>

        <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-4 py-3 text-center">
          <div className="text-caption2 text-[var(--color-label-tertiary)]">
            {isNeg ? '반품 수량 (−)' : '수량'}
          </div>
          <div
            className="text-title1 font-bold tabular-nums"
            style={{
              color: isNeg
                ? 'var(--color-system-red)'
                : 'var(--color-label-primary)',
            }}
          >
            {displayNum.toLocaleString()}
          </div>
          {dirty && baselineLabel && (
            <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
              {baselineLabel} {value}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <KeyBtn key={d} label={d} onClick={() => append(d)} />
          ))}
          {allowNegative ? (
            <KeyBtn
              label="±"
              subtle={!isNeg}
              danger={isNeg}
              onClick={toggleSign}
              ariaLabel="부호 전환 (반품/매입)"
            />
          ) : (
            <KeyBtn
              label="지움"
              subtle
              onClick={() => {
                userEditedRef.current = true;
                freshRef.current = false;
                setAbsStr('0');
              }}
            />
          )}
          <KeyBtn label="0" onClick={() => append('0')} />
          <KeyBtn label="⌫" subtle onClick={backspace} ariaLabel="한 자리 지움" />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || submitting}
            className={[
              'pressable touch-target rounded-xl px-4 py-2.5 text-white font-semibold disabled:opacity-40',
              isNeg ? 'bg-[var(--color-system-red)]' : 'bg-[var(--color-system-blue)]',
            ].join(' ')}
          >
            {submitting ? '저장 중…' : isNeg ? `반품 ${saveLabel}` : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyBtn({
  label,
  subtle,
  danger,
  onClick,
  ariaLabel,
}: {
  label: string;
  subtle?: boolean;
  danger?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        'pressable touch-target-lg rounded-xl text-title2 font-medium',
        danger
          ? 'bg-[var(--color-system-red)] text-white'
          : subtle
            ? 'bg-[var(--color-fill-secondary)] text-[var(--color-label-secondary)]'
            : 'bg-[var(--color-bg-elevated,var(--color-bg-primary))] text-[var(--color-label-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
