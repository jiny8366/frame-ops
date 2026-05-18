// Frame Ops Web — 라우트 ↔ 권한 키 매핑 (단일 source of truth)
//
// 이 매핑은 다음 3곳에서 공통으로 사용:
//   1) 홈 page.tsx / Header.tsx / BottomTabBar — 권한 없는 메뉴 아이콘 숨김 (UI)
//   2) PermissionGuard 컴포넌트 — URL 직접 입력 시 페이지 차단 (client guard)
//   3) middleware.ts — 서버 측 prefix 기반 deep guard (URL 강제 입력도 차단)
//
// 정책:
//   - longest-prefix match 로 결정 (`/inventory/audit` > `/inventory`)
//   - 매핑이 없는 라우트는 권한 체크 없이 통과 (login, /, /api/auth 등)
//   - 모든 권한 키는 lib/auth/permissions.ts 의 ALL_PERMISSIONS 와 일치해야 함.

/** 라우트 경로 → 필요한 권한 키. */
export const ROUTE_PERMISSIONS: Record<string, string> = {
  // 지점 메인 메뉴
  '/pos':                     'pos_sales',
  '/inventory':               'inventory_view',
  '/inventory/audit':         'inventory_edit_stock',
  '/inventory/pending':       'inventory_pending',
  '/admin/orders':            'orders_list',
  '/admin/stats':             'sales_stats',
  '/admin/settlement':        'settlement',
  '/admin/sales-search':      'sales_search',
  '/admin/inbound':           'inbound_register',
  '/admin/transfers':         'interstore_transfer',

  // 마스터 (본사 + 상위 권한)
  '/admin/products':          'master_products',
  '/admin/suppliers':         'master_suppliers',

  // 지점 관리
  '/admin/staff':             'store_staff_manage',
  '/admin/store-info':        'store_info_edit',
  '/admin/attendance':        'attendance_view',

  // 본사 portal
  '/hq':                      'hq_dashboard',
  '/hq/stores':               'hq_stores_manage',
  '/hq/staff':                'hq_staff_manage',
  '/hq/store-accounts':       'hq_store_accounts',
  '/hq/stats':                'hq_stats',
  '/hq/sales-search':         'hq_sales_search',
  '/hq/comparison':           'hq_comparison',
};

/**
 * 주어진 pathname 에 필요한 권한 키 반환 (없으면 null = 자유 접근).
 * longest-prefix match.
 */
export function getRequiredPermission(pathname: string): string | null {
  // pathname 정규화: trailing slash 제거 (단 '/' 자체는 유지)
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  // 가장 긴 매칭 prefix 우선 (예: /inventory/audit 이 /inventory 보다 먼저)
  const sorted = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
  for (const route of sorted) {
    if (normalized === route || normalized.startsWith(route + '/')) {
      return ROUTE_PERMISSIONS[route];
    }
  }
  return null;
}

/**
 * 사용자가 해당 경로에 접근 가능한지 판정.
 * - 권한 매핑이 없는 경로는 항상 true (자유 접근)
 * - 매핑이 있고 권한 보유 시 true, 미보유 시 false
 */
export function canAccessRoute(
  pathname: string,
  permissions: string[] | null | undefined
): boolean {
  const required = getRequiredPermission(pathname);
  if (!required) return true;
  return Array.isArray(permissions) && permissions.includes(required);
}
