// Frame Ops — 앱 헤더
// Apple HIG Materials: 반투명 배경 + backdrop-blur (vibrancy)
// 레이아웃: [Logo] [Nav] ........... [ThemeToggle] [UserMenu]

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle, ThemeToggleMobile } from '@/components/ui/ThemeToggle';

// ── 내비게이션 링크 정의 ──────────────────────────────────────────────────────
const NAV_LINKS = [
  { href: '/pos',    label: 'POS 판매' },
  { href: '/frames', label: '재고' },
  { href: '/orders', label: '매출' },
] as const;

// ── 헤더 컴포넌트 ─────────────────────────────────────────────────────────────
export function Header() {
  const pathname = usePathname();

  return (
    <header
      className={[
        // 고정 위치 + 레이어
        'sticky top-0 z-50 w-full',
        // Apple HIG vibrancy: 반투명 + blur
        'bg-[var(--header-bg)]',
        '-webkit-backdrop-filter: saturate(180%) blur(20px)',
        'backdrop-filter saturate-[180%] blur-[20px]',
        // backdrop-filter 미지원 브라우저 폴백 (Safari 구버전 대응)
        'supports-[backdrop-filter:blur(0)]:bg-[var(--header-bg)]',
        // 하단 구분선
        'border-b border-[var(--header-border)]',
        // 전환 (테마 변경 시)
        'transition-colors duration-300',
      ].join(' ')}
    >
      <div className="flex h-14 items-center justify-between px-4 md:px-6">

        {/* ── 왼쪽: 로고 + 데스크톱 네비게이션 ─────────────────────────── */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-[var(--color-label-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-system-blue)] focus-visible:outline-offset-2 rounded-md"
          >
            <span className="text-xl" aria-hidden>👓</span>
            <span className="text-[15px] font-bold tracking-tight">Frame Ops</span>
          </Link>

          {/* 데스크톱 네비게이션 — 모바일에서 숨김 */}
          <nav className="hidden md:flex items-center gap-1" aria-label="주 내비게이션">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'px-3 py-1.5 rounded-[6px]',
                    'text-[13px] font-[500]',
                    'transition-colors duration-150',
                    'focus-visible:outline-2 focus-visible:outline-[var(--color-system-blue)] focus-visible:outline-offset-1',
                    isActive
                      ? 'text-[var(--color-system-blue)] bg-[var(--color-fill-tertiary)]'
                      : 'text-[var(--color-label-secondary)] hover:text-[var(--color-label-primary)] hover:bg-[var(--color-fill-quaternary)]',
                  ].join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ── 오른쪽: ThemeToggle + 사용자 메뉴 ─────────────────────────── */}
        <div className="flex items-center gap-3">
          {/*
            데스크톱: 아이콘 + 라벨 전체 표시
            모바일: 아이콘만 (헤더 공간 절약)
          */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <div className="block sm:hidden">
            <ThemeToggleMobile />
          </div>

          {/* 사용자 메뉴 자리 (추후 구현) */}
          <button
            aria-label="사용자 메뉴"
            className={[
              'flex h-8 w-8 items-center justify-center',
              'rounded-full',
              'bg-[var(--color-fill-tertiary)]',
              'text-[var(--color-label-secondary)]',
              'text-[13px] font-semibold',
              'hover:bg-[var(--color-fill-secondary)]',
              'active:scale-95 transition-transform duration-100',
              'focus-visible:outline-2 focus-visible:outline-[var(--color-system-blue)] focus-visible:outline-offset-1',
            ].join(' ')}
          >
            J
          </button>
        </div>
      </div>
    </header>
  );
}

// ── 모바일 하단 탭바 ──────────────────────────────────────────────────────────
// 모바일에서 상단 헤더 내비게이션을 대체
export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="하단 탭 내비게이션"
      className={[
        'fixed bottom-0 inset-x-0 z-50',
        'md:hidden',  // 데스크톱에서는 숨김
        'bg-[var(--header-bg)]',
        'backdrop-filter saturate-[180%] blur-[20px]',
        'border-t border-[var(--header-border)]',
        'safe-bottom',
        'transition-colors duration-300',
      ].join(' ')}
    >
      <div className="flex items-stretch h-[49px]">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const ICONS: Record<string, string> = {
            '/pos': '💳', '/frames': '👓', '/orders': '📊',
          };
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-0.5',
                'text-[10px] font-medium',
                'transition-colors duration-100',
                'active:opacity-70',
                isActive
                  ? 'text-[var(--color-system-blue)]'
                  : 'text-[var(--color-label-tertiary)]',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="text-[22px] leading-none" aria-hidden>{ICONS[href]}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
