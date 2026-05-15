'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

interface Tab {
  href: string;
  label: string;
  icon: string;
  match: (path: string) => boolean;
}

const TABS: Tab[] = [
  { href: '/', label: '홈', icon: '🏠', match: (p) => p === '/' },
  {
    href: '/customer/order',
    label: '주문',
    icon: '🛒',
    match: (p) => p.startsWith('/customer/order'),
  },
  {
    href: '/customer/orders',
    label: '내 주문',
    icon: '📦',
    match: (p) => p.startsWith('/customer/orders'),
  },
  {
    href: '/customer',
    label: '마이',
    icon: '👤',
    match: (p) => p === '/customer',
  },
];

export function CustomerBottomNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  'flex h-14 min-h-touch flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                  active ? 'text-brand-600' : 'text-gray-500',
                )}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
