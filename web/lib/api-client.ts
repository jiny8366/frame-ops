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
export const salesApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiFetch<unknown[]>(`/api/orders${qs}`);
  },
  create: (body: Record<string, unknown>) =>
    apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
};

// ── 재고 ──────────────────────────────────────────────────────────────────────
export const inventoryApi = {
  list: (params?: Record<string, string | number>) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return apiFetch<unknown[]>(`/api/inventory${qs}`);
  },
};
