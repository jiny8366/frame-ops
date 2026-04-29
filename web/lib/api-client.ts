// Frame Ops Web — API 클라이언트
// 모든 데이터 요청은 이 파일을 통해 /api/* 로 라우팅됨
// Supabase를 직접 호출하지 않음 → 서비스롤 키 브라우저 노출 없음

const BASE = '';  // 동일 오리진 — 절대 경로 사용

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
    if (!res.ok) {
      return { data: null, error: json.error ?? `HTTP ${res.status}` };
    }
    return json;
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

// ── 제품 ──────────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiFetch<unknown[]>(`/api/products${qs}`);
  },
  create: (body: Record<string, unknown>) =>
    apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) }),
};

// ── 브랜드 ────────────────────────────────────────────────────────────────────
export const brandsApi = {
  list: () => apiFetch<unknown[]>('/api/brands'),
};

// ── 매출 ──────────────────────────────────────────────────────────────────────
import type { SaleInput } from '@/types';

export interface CreateSaleResult {
  sale_id: string;
  sold_at: string;
  total_amount: number;
  items_created: number;
}

export const salesApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiFetch<unknown[]>(`/api/orders${qs}`);
  },

  /**
   * @deprecated Phase 2 TASK 7 — 신규 코드는 createWithItems 사용.
   * sync_queue 의 레거시 'orders' 항목 호환 위해 유지 (단순 fo_sales insert,
   * 품목/재고 처리 안 됨).
   */
  create: (body: Record<string, unknown>) =>
    apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Phase 2 결제 표준 경로. RPC create_sale_with_items 호출.
   * 판매(fo_sales) + 품목(fo_sale_items) + 재고 차감 원자 처리.
   * idempotency_key 필수.
   */
  createWithItems: (payload: SaleInput) =>
    apiFetch<CreateSaleResult>('/api/sales/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── 제품 검색 (Phase 2 신규) ──────────────────────────────────────────────────
// productsApi 객체에 search 메서드를 별도 export 로 추가.
export const productsSearch = (
  query: string | null,
  brandId?: string | null,
  limit: number = 50,
  offset: number = 0
) => {
  const params = new URLSearchParams();
  if (query)   params.set('q', query);
  if (brandId) params.set('brand', brandId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return apiFetch<unknown[]>(`/api/products/search?${params.toString()}`);
};

// ── 재고 ──────────────────────────────────────────────────────────────────────
export interface PendingStockItem {
  id: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  brand_name: string;
  stock_quantity: number;
  pending_count: number;
  product_line?: string | null;
  category?: string | null;
}

export const inventoryApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiFetch<unknown[]>(`/api/inventory${qs}`);
  },

  /** Phase 2: 매입 대기 (stock_quantity < 0) 제품 목록. RPC get_pending_stock_items. */
  pending: () => apiFetch<PendingStockItem[]>('/api/inventory/pending'),
};
