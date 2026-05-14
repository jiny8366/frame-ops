import Link from 'next/link';
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

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold">Funnyview Pickup</span>
          <span className={`text-sm font-medium ${meta.accent}`}>· {meta.label}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ))}
          <NotificationBell />
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
