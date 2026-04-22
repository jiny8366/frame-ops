// Frame Ops Web — 프리페칭 훅
// hover/focus 시 /api/* 를 통해 상세 데이터를 SWR 캐시에 미리 로드
// LRU(최근 N개)로 prefetched 키셋 크기를 제한하여 장시간 사용 시 메모리 누수 방지

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { mutate } from 'swr';
import { productsApi, salesApi } from '@/lib/api-client';
import type { Product, Sale } from '@/types';

const PREFETCH_CACHE_LIMIT = 100;

/** LRU Set — 최근 N개만 유지, 초과 시 가장 오래된 키 제거 */
class LRUSet<T> {
  private map = new Map<T, true>();

  constructor(private readonly limit: number) {}

  has(key: T): boolean {
    if (!this.map.has(key)) return false;
    // 접근 시 맨 뒤로 이동 (최근 사용 갱신)
    this.map.delete(key);
    this.map.set(key, true);
    return true;
  }

  add(key: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.limit) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, true);
  }

  clear(): void {
    this.map.clear();
  }
}

export function usePrefetchFrame() {
  const prefetchedRef = useRef(new LRUSet<string>(PREFETCH_CACHE_LIMIT));

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

  // 언마운트 시 캐시 정리
  useEffect(() => {
    const ref = prefetchedRef.current;
    return () => {
      ref.clear();
    };
  }, []);

  return prefetch;
}

export function usePrefetchSale() {
  const prefetchedRef = useRef(new LRUSet<string>(PREFETCH_CACHE_LIMIT));

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

  useEffect(() => {
    const ref = prefetchedRef.current;
    return () => {
      ref.clear();
    };
  }, []);

  return prefetch;
}
