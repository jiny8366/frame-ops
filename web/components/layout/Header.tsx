// Frame Ops — 앱 헤더
// Apple HIG Materials: 반투명 배경 + backdrop-blur (vibrancy)
// 레이아웃: [Logo] [Nav] ........... [ThemeToggle] [UserMenu]

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle, ThemeToggleMobile } from '@/components/ui/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';
import { useSession } from '@/hooks/useSession';

// ── 내비게이션 링크 정의 ──────────────────────────────────────────────────────
// /orders 매출 라우트는 Phase 3 에서 추가 예정 (현재 /api/orders GET 만 존재).
const NAV_LINKS = [
  { href: '/pos',                label: 'POS 판매' },
  { href: '/frames',             label: '재고' },
  { href: '/inventory/pending',  label: '발주' },
] as const;

// ── 헤더 컴포넌트 ─────────────────────────────────────────────────────────────
export function Header() {
  const pathname = usePathname();
  const { session } = useSession();

  // 로그인 페이지에서는 헤더 숨김
  if (pathname === '/login') return null;

  return (
    <header
      className={[
        // 고정 위치 + 레이어
        'sticky top-0 z-50 w-full',
        // 불투명 배경 (vibrancy 제거 — 가시성 우선)
        'bg-[var(--color-bg-primary)]',
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

          {/* 현재 지점명 — 세션 있을 때만 */}
          {session && (
            <span
              className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--color-fill-quaternary)] text-[12px] font-medium text-[var(--color-label-secondary)] truncate max-w-[10rem]"
              title={`${session.store_name} (${session.store_code})`}
            >
              {session.store_name}
            </span>
          )}

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

          {/* 사용자 메뉴 — 세션 있으면 드롭다운, 없으면 placeholder */}
          {session ? (
            <UserMenu session={session} />
          ) : (
            <div
              aria-hidden
              className="h-8 w-8 rounded-full bg-[var(--color-fill-tertiary)]"
            />
          )}
        </div>
      </div>
    </header>
  );
}

// ── 모바일 하단 탭바 ──────────────────────────────────────────────────────────
// 모바일에서 상단 헤더 내비게이션을 대체
export function BottomTabBar() {
  const pathname = usePathname();

  // 로그인 페이지에서는 탭바 숨김
  if (pathname === '/login') return null;

  return (
    <nav
      aria-label="하단 탭 내비게이션"
      className={[
        'fixed bottom-0 inset-x-0 z-50',
        'md:hidden',  // 데스크톱에서는 숨김
        'bg-[var(--color-bg-primary)]',
        'border-t border-[var(--header-border)]',
        'safe-bottom',
        'transition-colors duration-300',
      ].join(' ')}
    >
      <div className="flex items-stretch h-[49px]">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          const ICONS: Record<string, string> = {
            '/pos': '💳',
            '/frames': '👓',
            '/inventory/pending': '📦',
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
