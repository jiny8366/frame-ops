// Frame Ops Web — 프리페칭 훅
// hover 시 /api/* 를 통해 상세 데이터를 미리 로드

'use client';

import { useCallback, useRef } from 'react';
import { mutate } from 'swr';
import { productsApi, salesApi } from '@/lib/api-client';
import type { Product, Sale } from '@/types';

export function usePrefetchFrame() {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);

    mutate(
      ['frame', id],
      async () => {
        const { data } = await productsApi.list({ id });
        return (data?.[0] ?? null) as Product | null;
      },
      { revalidate: false }
    );
  }, []);

  return prefetch;
}

export function usePrefetchSale() {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);

    mutate(
      ['sale', id],
      async () => {
        const { data } = await salesApi.list({ id });
        return (data?.[0] ?? null) as Sale | null;
      },
      { revalidate: false }
    );
  }, []);

  return prefetch;
}

export function prefetchHandlers(id: string, prefetchFn: (id: string) => void) {
  return {
    onMouseEnter: () => prefetchFn(id),
    onFocus: () => prefetchFn(id),
  };
}
