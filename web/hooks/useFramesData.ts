// Frame Ops Web — 제품 데이터 훅
// /api/products → 서버사이드 Supabase → 브라우저로 반환
// Supabase를 직접 호출하지 않음
// IDB 프리로드는 Providers에서 SWRConfig.fallback으로 주입됨 (TASK 7에서 이전)

'use client';

import useSWR from 'swr';
import { productsApi } from '@/lib/api-client';
import { dbPutMany } from '@/lib/db/indexeddb';
import type { Product, TableFilters } from '@/types';

// ── Fetcher ───────────────────────────────────────────────────────────────────
async function fetchProducts(filters: TableFilters): Promise<Product[]> {
  const params: Record<string, string | number> = {};
  if (filters.search)   params.search   = filters.search;
  if (filters.page)     params.page     = filters.page;
  if (filters.pageSize) params.limit    = filters.pageSize;

  const { data, error } = await productsApi.list(params);
  if (error) throw new Error(error);
  return (data ?? []) as Product[];
}

// ── 제품 목록 훅 ──────────────────────────────────────────────────────────────
// cacheKey는 Providers의 FRAMES_INITIAL_KEY 상수와 구조를 맞춰야 함.
export function useFramesData(filters: TableFilters = {}) {
  const cacheKey = ['frames', JSON.stringify(filters)];

  const { data, error, isLoading, isValidating, mutate } = useSWR<Product[]>(
    cacheKey,
    () => fetchProducts(filters),
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: true,
      revalidateOnMount: true,
      errorRetryCount: 3,
      onSuccess(freshData) {
        if (!freshData?.length) return;
        // IDB 쓰기는 우선순위 낮은 idle 타임에 수행 (스크롤 프레임 방해 금지)
        const update = () => dbPutMany('frames', freshData).catch(console.error);
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(update);
        } else {
          setTimeout(update, 0);
        }
      },
    }
  );

  return {
    frames: data ?? [],
    isLoading,
    isValidating,
    error,
    mutate,
  };
}

// ── 브랜드별 제품 훅 ──────────────────────────────────────────────────────────
export function useFramesByBrand(brandId: string | null) {
  return useSWR<Product[]>(
    brandId ? ['frames-by-brand', brandId] : null,
    async () => {
      const { data, error } = await productsApi.list({ brand_id: brandId!, limit: 100 });
      if (error) throw new Error(error);
      return (data ?? []) as Product[];
    },
    { revalidateOnFocus: false }
  );
}

// ── 브랜드 목록 훅 ────────────────────────────────────────────────────────────
export function useBrands() {
  return useSWR(
    'brands',
    async () => {
      const { brandsApi } = await import('@/lib/api-client');
      const { data, error } = await brandsApi.list();
      if (error) throw new Error(error);
      return data ?? [];
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
}
