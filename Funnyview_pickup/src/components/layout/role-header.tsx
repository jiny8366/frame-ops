'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PushToggle } from '@/components/pwa/push-toggle';
import { LogoutButton } from './logout-button';
import { NotificationBell } from './notification-bell';

type Role = 'customer' | 'warehouse' | 'store';

const ROLE_META: Record<Role, { label: string; accent: string }> = {
  customer: { label: '고객', accent: 'text-brand-600' },
  warehouse: { label: '픽업서비스 업체', accent: 'text-emerald-600' },
  store: { label: '픽업가맹점', accent: 'text-amber-600' },
};

export function RoleHeader({
  role,
  nav,
}: {
  role: Role;
  nav: { href: string; label: string }[];
}) {
  const meta = ROLE_META[role];
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 md:px-6 md:py-4">
        <Link href="/" className="flex items-baseline gap-1.5 truncate">
          <span className="truncate text-base font-semibold md:text-lg">
            Funnyview Pickup
          </span>
          <span className={`hidden text-sm font-medium md:inline ${meta.accent}`}>
            · {meta.label}
          </span>
        </Link>

        {/* 데스크탑 네비 */}
        <nav className="hidden items-center gap-4 text-sm text-gray-600 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ))}
          <PushToggle />
          <NotificationBell />
          <LogoutButton />
        </nav>

        {/* 모바일 우측 — 알림 + 햄버거 */}
        <div className="flex items-center gap-1 md:hidden">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 min-h-touch min-w-touch items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="메뉴 열기"
            aria-expanded={open}
          >
            <span className="sr-only">메뉴</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 모바일 드로어 */}
      {open && (
        <div className="border-t border-gray-100 bg-white md:hidden">
          <div className="space-y-1 px-4 py-3">
            <div className={`px-1 pb-2 text-xs font-medium ${meta.accent}`}>
              {meta.label}
            </div>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-touch items-center rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-1 pt-3">
              <PushToggle />
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
