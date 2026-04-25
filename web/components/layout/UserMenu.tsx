// Frame Ops Web — 헤더 우측 사용자 드롭다운
// Phase A: 로그아웃만 동작. 나머지는 표시만 (회색, 클릭 시 안내).

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { SessionMe } from '@/hooks/useSession';

interface UserMenuProps {
  session: SessionMe;
}

interface MenuItem {
  label: string;
  enabled: boolean;
  href?: string;
  onClick?: () => void;
  divider?: boolean;
}

export function UserMenu({ session }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    await mutate('/api/auth/me');
    setOpen(false);
    router.replace('/login');
  }, [router]);

  const showSoon = useCallback(() => {
    // 후속 Phase 에서 구현 예정 — 토스트 대신 콘솔 안내 (의존 최소화)
    console.info('[UserMenu] 준비 중 — 후속 Phase 에서 구현 예정');
    setOpen(false);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // 메뉴 구성: Phase A=로그아웃, Phase B1=직원/매장 추가됨. 후속 phase 에서 enabled=true 로 전환.
  const items: MenuItem[] = [
    { label: '판매통계', enabled: false, onClick: showSoon },
    { label: '판매내역 검색', enabled: false, onClick: showSoon },
    { label: '정산', enabled: false, onClick: showSoon },
    { label: '주문리스트', enabled: false, onClick: showSoon },
    { label: '매입처리', enabled: false, onClick: showSoon },
    { divider: true, label: '', enabled: false },
    { label: '직원 관리', enabled: true, href: '/admin/staff' },
    { label: '매장 정보', enabled: true, href: '/admin/store' },
    { label: '매입 등록', enabled: false, onClick: showSoon },
    { label: '일일 마감', enabled: false, onClick: showSoon },
    { divider: true, label: '', enabled: false },
    { label: '로그아웃', enabled: true, onClick: handleLogout },
  ];

  const initials = (session.display_name || session.store_code).slice(0, 1);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="사용자 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex h-8 items-center gap-2 px-2',
          'rounded-full',
          'bg-[var(--color-fill-tertiary)]',
          'text-[var(--color-label-primary)]',
          'text-[13px] font-semibold',
          'hover:bg-[var(--color-fill-secondary)]',
          'active:scale-95 transition-transform duration-100',
          'focus-visible:outline-2 focus-visible:outline-[var(--color-system-blue)] focus-visible:outline-offset-1',
        ].join(' ')}
      >
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-system-blue)] text-white text-[11px]"
        >
          {initials}
        </span>
        <span className="hidden sm:inline max-w-[8rem] truncate">
          {session.display_name || '담당자'}
        </span>
        <span aria-hidden className="text-[10px] text-[var(--color-label-tertiary)]">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className={[
            'absolute right-0 top-[calc(100%+6px)]',
            'min-w-[200px]',
            'rounded-xl bg-[var(--color-bg-elevated,var(--color-bg-secondary))]',
            'shadow-lg ring-1 ring-[var(--color-separator-opaque)]',
            'overflow-hidden z-50',
          ].join(' ')}
        >
          <div className="px-3 py-2 border-b border-[var(--color-separator-opaque)]">
            <div className="text-callout font-semibold truncate">{session.display_name}</div>
            <div className="text-caption2 text-[var(--color-label-tertiary)] truncate">
              {session.store_name} · {session.store_code}
            </div>
          </div>
          <div className="py-1">
            {items.map((item, idx) =>
              item.divider ? (
                <div
                  key={`d-${idx}`}
                  className="my-1 border-t border-[var(--color-separator-opaque)]"
                />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.href ? () => navigate(item.href!) : item.onClick}
                  disabled={!item.enabled}
                  className={[
                    'w-full text-left px-3 py-2',
                    'text-callout',
                    item.enabled
                      ? 'text-[var(--color-label-primary)] hover:bg-[var(--color-fill-quaternary)]'
                      : 'text-[var(--color-label-tertiary)] cursor-not-allowed',
                  ].join(' ')}
                >
                  {item.label}
                  {!item.enabled && (
                    <span className="ml-2 text-caption2 text-[var(--color-label-tertiary)]">
                      준비 중
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
