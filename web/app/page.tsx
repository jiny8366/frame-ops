// Frame Ops — 홈 (대시보드)
// hq_* role 이면 /hq 로 리다이렉트, 그 외엔 지점 대시보드 표시.
// 메뉴 아이콘은 권한 보유한 것만 노출 (route-permissions 매핑 기반).

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { hasPermission, isHqRole } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: '대시보드' };

interface NavItem {
  href: string;
  label: string;
  icon: string;
  color: string;
  /** 필요 권한 키. null/undefined 이면 권한 체크 없이 노출. */
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/pos',                label: 'POS 판매',     icon: '💳', color: 'bg-brand-600',   permission: 'pos_sales' },
  { href: '/inventory',          label: '재고 조회',    icon: '👓', color: 'bg-emerald-600', permission: 'inventory_view' },
  { href: '/admin/stats',        label: '판매통계',     icon: '📊', color: 'bg-violet-600',  permission: 'sales_stats' },
  { href: '/admin/settlement',   label: '정산',         icon: '🧾', color: 'bg-amber-600',   permission: 'settlement' },
  { href: '/admin/orders',       label: '주문리스트',   icon: '📦', color: 'bg-sky-600',     permission: 'orders_list' },
  { href: '/admin/sales-search', label: '판매내역',     icon: '🔍', color: 'bg-pink-600',    permission: 'sales_search' },
];

export default async function DashboardPage() {
  const session = await getServerSession();
  if (session && isHqRole(session.role_code)) {
    redirect('/hq');
  }

  // 권한 필터링 — 권한 정의가 있고 사용자가 보유하지 않으면 숨김.
  // 세션이 없는 경우는 middleware 가 이미 /login 으로 리다이렉트했어야 하지만 방어적으로 빈 목록.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!session) return false;
    if (!item.permission) return true;
    return hasPermission(session.permissions, item.permission);
  });

  return (
    <main className="min-h-screen bg-surface-secondary p-4 safe-padding">
      <header className="mb-6">
        <h1 className="text-title1 font-bold text-gray-900">Frame Ops</h1>
        <p className="text-footnote text-gray-500">GENIUS OPTICAL</p>
      </header>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-callout font-semibold text-gray-700">접근 가능한 메뉴가 없습니다.</p>
          <p className="text-footnote text-gray-500 mt-1">
            본사 관리자에게 권한 부여를 요청하세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visibleItems.map((item) => (
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
      )}
    </main>
  );
}
