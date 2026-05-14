import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/layout/logout-button';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin/home', label: '홈 섹션' },
  { href: '/admin/home/analytics', label: '분석' },
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
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-base font-semibold">
            Funnyview Pickup · <span className="text-gray-500">관리자</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm text-gray-600">
            {NAV.map((it) => (
              <Link key={it.href} href={it.href} className="hover:text-gray-900">
                {it.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
    </div>
  );
}
