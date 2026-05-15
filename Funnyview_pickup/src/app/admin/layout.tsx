import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/layout/logout-button';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin/dashboard', label: '대시보드' },
  { href: '/admin/home', label: '홈 섹션' },
  { href: '/admin/home/analytics', label: '섹션 분석' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login/admin?next=' + encodeURIComponent('/admin/home'));
  }
  if (user.role !== 'admin') {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-20 border-b border-gray-200 bg-white"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 md:px-6">
          <Link href="/" className="truncate text-sm font-semibold md:text-base">
            Funnyview Pickup
            <span className="hidden text-gray-500 md:inline"> · 관리자</span>
          </Link>
          <nav className="flex items-center gap-1 text-xs md:gap-3 md:text-sm text-gray-600">
            {NAV.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="rounded-lg px-2 py-1.5 hover:bg-gray-100 hover:text-gray-900"
              >
                {it.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-safe md:px-6 md:py-6">
        {children}
      </main>
    </div>
  );
}
