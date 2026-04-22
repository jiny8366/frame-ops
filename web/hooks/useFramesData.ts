// Frame Ops — SWR + IndexedDB 통합 훅
// 첫 렌더: IndexedDB 즉시 반환 → 백그라운드 Supabase 갱신 (stale-while-revalidate)

'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { dbGetAll, dbPutMany } from '@/lib/db/indexeddb';
import type { Product, TableFilters } from '@/types';

// ── Supabase fetcher ──────────────────────────────────────────────────────────
async function fetchFramesFromSupabase(filters: TableFilters): Promise<Product[]> {
  let query = supabase
    .from('fo_products')
    .select('*, brand:fo_brands(id, brand_code, brand_name)')
    .eq('is_active', true)
    .order('style_code', { ascending: true });

  if (filters.search) {
    query = query.or(
      `style_code.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`
    );
  }

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 0;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Product[];
}

// ── 메인 훅 ──────────────────────────────────────────────────────────────────
export function useFramesData(filters: TableFilters = {}) {
  // IndexedDB에서 즉시 fallback 데이터 로드
  const [idbFallback, setIdbFallback] = useState<Product[] | undefined>(undefined);

  useEffect(() => {
    dbGetAll<Product>('frames').then((cached) => {
      if (cached.length > 0) setIdbFallback(cached);
    });
  }, []);

  const cacheKey = ['frames', JSON.stringify(filters)];

  const { data, error, isLoading, isValidating, mutate } = useSWR<Product[]>(
    cacheKey,
    () => fetchFramesFromSupabase(filters),
    {
      // IndexedDB 캐시를 SWR fallback으로 사용
      fallbackData: idbFallback,
      // 5분마다 재검증
      refreshInterval: 5 * 60 * 1000,
      // 포커스 시 재검증 (탭 전환 후 돌아올 때)
      revalidateOnFocus: true,
      // 마운트 시 항상 재검증
      revalidateOnMount: true,
      // 에러 시 재시도 3회
      errorRetryCount: 3,
      // 데이터 수신 후 IndexedDB 업데이트
      onSuccess(freshData) {
        if (freshData?.length) {
          dbPutMany('frames', freshData).catch(console.error);
        }
      },
    }
  );

  return {
    frames: data ?? idbFallback ?? [],
    isLoading: isLoading && !idbFallback,  // IndexedDB 데이터 있으면 로딩 아님
    isValidating,
    error,
    mutate,
  };
}

// ── 단건 훅 ──────────────────────────────────────────────────────────────────
export function useFrameDetail(id: string | null) {
  const { data, error, isLoading } = useSWR<Product | null>(
    id ? ['frame', id] : null,
    async () => {
      const { data, error } = await supabase
        .from('fo_products')
        .select('*, brand:fo_brands(*)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Product;
    },
    { revalidateOnFocus: false }
  );

  return { frame: data, isLoading, error };
}

// ── 브랜드별 제품 훅 ──────────────────────────────────────────────────────────
export function useFramesByBrand(brandId: string | null) {
  return useSWR<Product[]>(
    brandId ? ['frames-by-brand', brandId] : null,
    async () => {
      const { data, error } = await supabase
        .from('fo_products')
        .select('*')
        .eq('brand_id', brandId!)
        .eq('is_active', true)
        .order('style_code');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    { revalidateOnFocus: false }
  );
}
