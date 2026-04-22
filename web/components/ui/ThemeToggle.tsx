// Frame Ops — Apple HIG 테마 토글
// iOS Segmented Control 스타일 (Light / Dark / Auto)
// 접근성: role=radiogroup, 키보드 화살표 네비게이션 완전 지원

'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react';
import { useTheme, type Theme } from '@/contexts/ThemeContext';

// ── 한국어 기본, i18n 교체 용이하도록 상수 분리 ──────────────────────────────
const LABELS: Record<Theme, string> = {
  light:  '라이트',
  dark:   '다크',
  system: '자동',
};

interface ThemeOption {
  value: Theme;
  label: string;
  icon: React.ReactNode;
  /** 아이콘 애니메이션 클래스 (선택 시) */
  selectedIconClass: string;
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: LABELS.light,
    icon: <Sun size={14} strokeWidth={2} aria-hidden />,
    // 선택 시 Sun: 90도 회전
    selectedIconClass: 'rotate-90',
  },
  {
    value: 'dark',
    label: LABELS.dark,
    icon: <Moon size={14} strokeWidth={2} aria-hidden />,
    // 선택 시 Moon: 살짝 스케일업
    selectedIconClass: 'scale-110',
  },
  {
    value: 'system',
    label: LABELS.system,
    icon: <Monitor size={14} strokeWidth={2} aria-hidden />,
    // 선택 시 Monitor: 페이드
    selectedIconClass: 'opacity-100',
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface ThemeToggleProps {
  className?: string;
  /** 'icon-only': 아이콘만 / 'full': 아이콘+라벨 */
  variant?: 'icon-only' | 'full';
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────
export function ThemeToggle({ className = '', variant = 'full' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 선택 인디케이터 위치 & 크기 (슬라이딩 애니메이션)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  // 선택된 버튼의 위치를 측정하여 인디케이터 이동
  const updateIndicator = useCallback(() => {
    const idx = OPTIONS.findIndex((o) => o.value === theme);
    const btn = buttonRefs.current[idx];
    if (!btn || !containerRef.current) return;

    // container 기준 상대 좌표
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const btnRect = btn.getBoundingClientRect();

    setIndicator({
      left: btnRect.left - containerLeft - 2, // 패딩 2px 보정
      width: btnRect.width,
    });
  }, [theme]);

  // theme 변경 또는 리사이즈 시 인디케이터 재계산
  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  // ── 키보드 네비게이션 ──────────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const currentIdx = OPTIONS.findIndex((o) => o.value === theme);

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const next = (currentIdx + 1) % OPTIONS.length;
        setTheme(OPTIONS[next].value);
        buttonRefs.current[next]?.focus();
        break;
      }
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const prev = (currentIdx - 1 + OPTIONS.length) % OPTIONS.length;
        setTheme(OPTIONS[prev].value);
        buttonRefs.current[prev]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        setTheme(OPTIONS[0].value);
        buttonRefs.current[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        const last = OPTIONS.length - 1;
        setTheme(OPTIONS[last].value);
        buttonRefs.current[last]?.focus();
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="테마 모드 선택"
      onKeyDown={handleKeyDown}
      className={[
        // 컨테이너 — iOS Segmented Control 형태
        'relative inline-flex items-center',
        'rounded-[8px] p-[2px]',
        'bg-[var(--color-fill-tertiary)]',
        className,
      ].join(' ')}
    >
      {/* ── 슬라이딩 인디케이터 (선택된 옵션 배경) ─────────────────────── */}
      <div
        aria-hidden
        className={[
          'absolute top-[2px] bottom-[2px]',
          'rounded-[6px]',
          'bg-[var(--color-bg-primary)]',
          'shadow-[var(--shadow-sm)]',
          // 부드러운 슬라이딩 (0.25s ease-out)
          'transition-[left,width] duration-[250ms] ease-out',
          // prefers-reduced-motion 대응은 globals.css에서 처리
        ].join(' ')}
        style={{
          left: `${indicator.left}px`,
          width: `${indicator.width}px`,
        }}
      />

      {/* ── 옵션 버튼들 ─────────────────────────────────────────────────── */}
      {OPTIONS.map((opt, idx) => {
        const isSelected = theme === opt.value;

        return (
          <button
            key={opt.value}
            ref={(el) => { buttonRefs.current[idx] = el; }}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${opt.label} 모드`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => setTheme(opt.value)}
            className={[
              // 기본 레이아웃
              'relative z-10 flex items-center gap-1.5',
              'px-3 py-1.5',
              'rounded-[6px]',
              'text-[13px] font-[500]',
              'leading-none select-none',
              // 전환 (색상만)
              'transition-colors duration-[200ms]',
              // 터치 최적화
              'touch-action-manipulation',
              // 색상
              isSelected
                ? 'text-[var(--color-label-primary)]'
                : 'text-[var(--color-label-secondary)]',
              // 비선택 호버: 미묘한 밝기 변화
              !isSelected && 'hover:text-[var(--color-label-primary)]',
              // 클릭 액티브: scale down
              'active:scale-95 transition-transform',
              // 포커스 링 (키보드 접근성)
              'focus-visible:outline-2',
              'focus-visible:outline-[var(--color-system-blue)]',
              'focus-visible:outline-offset-1',
              'focus-visible:rounded-[6px]',
              'outline-none',
            ].join(' ')}
          >
            {/* 아이콘 — 선택 시 애니메이션 */}
            <span
              className={[
                'transition-transform duration-[250ms] ease-out',
                isSelected ? opt.selectedIconClass : '',
              ].join(' ')}
            >
              {opt.icon}
            </span>

            {/* 라벨 — variant에 따라 표시 여부 */}
            {variant === 'full' && (
              <span className="whitespace-nowrap">{opt.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 모바일용 아이콘 전용 변형 ─────────────────────────────────────────────────
export function ThemeToggleMobile({ className = '' }: { className?: string }) {
  return <ThemeToggle variant="icon-only" className={className} />;
}
