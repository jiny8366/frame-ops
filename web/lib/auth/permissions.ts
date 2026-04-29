// Frame Ops Web — 메뉴별 접근 권한 정책
// 각 메뉴/페이지마다 키를 부여. 사용자별 explicit 권한 또는 role 기본값 적용.

export interface PermissionDef {
  key: string;
  label: string;
  group: '운영' | '분석' | '마스터' | '지점관리' | '본사';
  scope: 'store' | 'hq' | 'both';
}

/**
 * 모든 권한 키 — 메뉴 추가/제거 시 여기에 반영하면 staff form 에 자동 노출.
 */
export const ALL_PERMISSIONS: PermissionDef[] = [
  // 지점 일상 운영
  { key: 'pos_sales',          label: 'POS 판매',           group: '운영',     scope: 'store' },
  { key: 'inventory_view',     label: '재고 조회',          group: '운영',     scope: 'store' },
  { key: 'inventory_edit_stock', label: '재고 수량 수정',   group: '운영',     scope: 'both'  },
  { key: 'inventory_pending',  label: '발주 대기',          group: '운영',     scope: 'store' },
  { key: 'orders_list',       label: '주문리스트',         group: '운영',     scope: 'store' },
  { key: 'inbound_register',  label: '매입 등록',          group: '운영',     scope: 'store' },
  { key: 'interstore_transfer', label: '점간이동',         group: '운영',     scope: 'both'  },
  { key: 'settlement',        label: '정산',               group: '운영',     scope: 'store' },

  // 분석
  { key: 'sales_stats',       label: '판매통계',           group: '분석',     scope: 'store' },
  { key: 'sales_search',      label: '판매내역 검색',      group: '분석',     scope: 'store' },

  // 본사 마스터 (현재 /admin/* 위치, 추후 /hq 이동 예정)
  { key: 'master_products',   label: '상품 등록',          group: '마스터',   scope: 'both' },
  { key: 'master_suppliers',  label: '매입처 관리',        group: '마스터',   scope: 'both' },

  // 지점 관리
  { key: 'store_staff_manage',label: '직원 관리 (지점)',   group: '지점관리', scope: 'store' },
  { key: 'store_info_edit',   label: '매장 정보',          group: '지점관리', scope: 'store' },
  { key: 'attendance_view',   label: '근태관리 (출퇴근)',  group: '지점관리', scope: 'both'  },

  // 본사 (HQ portal)
  { key: 'hq_dashboard',         label: '본사 대시보드',          group: '본사',     scope: 'hq' },
  { key: 'hq_stores_manage',     label: '매장 관리 (본사)',       group: '본사',     scope: 'hq' },
  { key: 'hq_staff_manage',      label: '계정설정 (본사용)',      group: '본사',     scope: 'hq' },
  { key: 'hq_store_accounts',    label: '매장 계정 (본사용)',     group: '본사',     scope: 'hq' },
  { key: 'hq_stats',             label: '본사 통합 통계',         group: '본사',     scope: 'hq' },
  { key: 'hq_sales_search',      label: '본사 판매내역',          group: '본사',     scope: 'hq' },
  { key: 'hq_comparison',        label: '매장 비교',              group: '본사',     scope: 'hq' },
  { key: 'settlement_edit_locked', label: '마감된 정산 수정',     group: '본사',     scope: 'hq' },
];

export const PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

/**
 * role 별 기본 권한 — 신규 직원 생성 시 자동 적용 + 명시 override 없을 때 fallback.
 */
export const ROLE_DEFAULTS: Record<string, string[]> = {
  hq_super: PERMISSION_KEYS, // 모든 권한
  hq_purchase: [
    'pos_sales',
    'inventory_view',
    'inventory_pending',
    'orders_list',
    'master_products',
    'master_suppliers',
    'hq_dashboard',
    'hq_stores_manage',
    'hq_stats',
  ],
  hq_view: [
    'sales_stats',
    'sales_search',
    'hq_dashboard',
    'hq_stats',
    'hq_sales_search',
    'hq_comparison',
  ],
  store_manager: [
    'pos_sales',
    'inventory_view',
    'inventory_edit_stock',
    'inventory_pending',
    'orders_list',
    'inbound_register',
    'interstore_transfer',
    'settlement',
    'sales_stats',
    'sales_search',
    'store_staff_manage',
    'store_info_edit',
    'attendance_view',
  ],
  store_salesperson: [
    'pos_sales',
    'inventory_view',
    'sales_search',
    'attendance_view',
  ],
  store_staff: ['pos_sales', 'inventory_view', 'sales_search', 'attendance_view'],
};

/**
 * 사용자 effective 권한 = explicit (DB) ?? role 기본값
 */
export function effectivePermissions(
  roleCode: string,
  explicit: string[] | null | undefined
): string[] {
  if (explicit && explicit.length > 0) return explicit;
  return ROLE_DEFAULTS[roleCode] ?? [];
}

export function hasPermission(perms: string[] | undefined | null, key: string): boolean {
  return Array.isArray(perms) && perms.includes(key);
}

export function isHqRole(roleCode: string): boolean {
  return roleCode.startsWith('hq_');
}
