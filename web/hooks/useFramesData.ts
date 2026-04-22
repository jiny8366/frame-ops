// Frame Ops Web — 제품 데이터 훅
// /api/products → 서버사이드 Supabase → 브라우저로 반환
// Supabase를 직접 호출하지 않음

'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/api-client';
import { dbGetAll, dbPutMany } from '@/lib/db/indexeddb';
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
export function useFramesData(filters: TableFilters = {}) {
  // IndexedDB 즉시 fallback
  const [idbFallback, setIdbFallback] = useState<Product[] | undefined>(undefined);

  useEffect(() => {
    dbGetAll<Product>('frames').then((cached) => {
      if (cached.length > 0) setIdbFallback(cached);
    });
  }, []);

  const cacheKey = ['frames', JSON.stringify(filters)];

  const { data, error, isLoading, isValidating, mutate } = useSWR<Product[]>(
    cacheKey,
    () => fetchProducts(filters),
    {
      fallbackData: idbFallback,
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: true,
      revalidateOnMount: true,
      errorRetryCount: 3,
      onSuccess(freshData) {
        if (freshData?.length) {
          dbPutMany('frames', freshData).catch(console.error);
        }
      },
    }
  );

  return {
    frames: data ?? idbFallback ?? [],
    isLoading: isLoading && !idbFallback,
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
