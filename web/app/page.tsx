// Frame Ops — 홈 (대시보드)
// hq_* role 이면 /hq 로 리다이렉트, 그 외엔 지점 대시보드 표시.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { isHqRole } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: '대시보드' };

const NAV_ITEMS = [
  { href: '/pos',                label: 'POS 판매',     icon: '💳', color: 'bg-brand-600' },
  { href: '/inventory',          label: '재고 조회',    icon: '👓', color: 'bg-emerald-600' },
  { href: '/admin/stats',        label: '판매통계',     icon: '📊', color: 'bg-violet-600' },
  { href: '/admin/settlement',   label: '정산',         icon: '🧾', color: 'bg-amber-600' },
  { href: '/admin/orders',       label: '주문리스트',   icon: '📦', color: 'bg-sky-600' },
  { href: '/admin/sales-search', label: '판매내역',     icon: '🔍', color: 'bg-pink-600' },
];

export default async function DashboardPage() {
  const session = await getServerSession();
  if (session && isHqRole(session.role_code)) {
    redirect('/hq');
  }

  return (
    <main className="min-h-screen bg-surface-secondary p-4 safe-padding">
      <header className="mb-6">
        <h1 className="text-title1 font-bold text-gray-900">Frame Ops</h1>
        <p className="text-footnote text-gray-500">GENIUS OPTICAL</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`
              ${item.color} touch-target-lg flex flex-col items-center justify-center
              rounded-2xl p-6 text-white shadow-sm
              active:scale-95 transition-transform duration-100
            `}
          >
            <span className="mb-2 text-3xl">{item.icon}</span>
            <span className="text-callout font-semibold">{item.label}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
