// Frame Ops Web — 헤더 우측 사용자 드롭다운
// Phase A: 로그아웃만 동작. 나머지는 표시만 (회색, 클릭 시 안내).

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import type { SessionMe } from '@/hooks/useSession';
import { hasPermission, isHqRole } from '@/lib/auth/permissions';

interface UserMenuProps {
  session: SessionMe;
}

interface MenuItem {
  label: string;
  enabled: boolean;
  /** 이 권한 키가 있어야 표시. undefined 면 항상 표시. */
  perm?: string;
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

  // 메뉴 정의 — 각 항목은 perm 키로 사용자별 표시 결정.
  const isHq = isHqRole(session.role_code);
  const allItems: MenuItem[] = [
    // ── 본사 전용 (hq_* 만) ────────────────────────────────────────
    ...(isHq
      ? ([
          { label: '대시보드', enabled: true, href: '/hq', perm: 'hq_dashboard' },
          { label: '매장 관리', enabled: true, href: '/hq/stores', perm: 'hq_stores_manage' },
          { label: '근태관리', enabled: true, href: '/admin/attendance', perm: 'attendance_view' },
          { label: '본사 통합 통계', enabled: false, onClick: showSoon, perm: 'hq_stats' },
          { label: '본사 판매내역', enabled: false, onClick: showSoon, perm: 'hq_sales_search' },
          { label: '매장 비교', enabled: false, onClick: showSoon, perm: 'hq_comparison' },
          { divider: true, label: '', enabled: false },
        ] as MenuItem[])
      : []),

    // ── 분석 / 운영 ─────────────────────────────────────────────────
    { label: '판매통계', enabled: true, href: '/admin/stats', perm: 'sales_stats' },
    { label: '판매내역 검색', enabled: true, href: '/admin/sales-search', perm: 'sales_search' },
    { label: '정산', enabled: true, href: '/admin/settlement', perm: 'settlement' },
    { label: '주문리스트', enabled: true, href: '/admin/orders', perm: 'orders_list' },
    { label: '매입 등록', enabled: true, href: '/admin/inbound', perm: 'inbound_register' },
    { divider: true, label: '', enabled: false },

    // ── 마스터 ──────────────────────────────────────────────────────
    { label: '상품 등록', enabled: true, href: '/admin/products', perm: 'master_products' },
    { label: '매입처 관리', enabled: true, href: '/admin/suppliers', perm: 'master_suppliers' },
    { divider: true, label: '', enabled: false },

    // ── 지점 관리 ───────────────────────────────────────────────────
    { label: '계정설정', enabled: true, href: '/admin/staff', perm: 'store_staff_manage' },
    // HQ 사용자는 '매장 관리' 에 매장 정보가 통합되어 있으므로 '매장 정보' 메뉴 회피
    // HQ 사용자는 본사 그룹의 '근태관리' 사용
    ...(!isHq
      ? ([
          { label: '매장 정보', enabled: true, href: '/admin/store', perm: 'store_info_edit' },
          { label: '근태관리', enabled: true, href: '/admin/attendance', perm: 'attendance_view' },
        ] as MenuItem[])
      : []),
    { divider: true, label: '', enabled: false },
    { label: '로그아웃', enabled: true, onClick: handleLogout },
  ];

  // 권한 필터 적용 + 연속된 divider 정리
  const filtered: MenuItem[] = [];
  for (const item of allItems) {
    if (item.divider) {
      // 직전이 divider 거나 비어있으면 skip
      if (filtered.length === 0 || filtered[filtered.length - 1].divider) continue;
      filtered.push(item);
      continue;
    }
    if (item.perm && !hasPermission(session.permissions, item.perm)) continue;
    filtered.push(item);
  }
  // 마지막 divider 제거
  while (filtered.length > 0 && filtered[filtered.length - 1].divider) filtered.pop();
  const items = filtered;

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
