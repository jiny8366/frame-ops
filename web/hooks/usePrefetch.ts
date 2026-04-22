// Frame Ops — 프리페칭 훅
// 마우스 hover 시 상세 페이지 데이터를 미리 불러와 체감 속도 향상

'use client';

import { useCallback, useRef } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/lib/supabase/client';
import type { Product, Customer, Order } from '@/types';

// ── 제품 프리페치 ──────────────────────────────────────────────────────────────
export function usePrefetchFrame() {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);

    mutate(
      ['frame', id],
      async () => {
        const { data } = await supabase
          .from('fo_products')
          .select('*, brand:fo_brands(*)')
          .eq('id', id)
          .single();
        return data as Product;
      },
      { revalidate: false }  // 이미 캐시된 경우 덮어쓰지 않음
    );
  }, []);

  return prefetch;
}

// ── 고객 프리페치 ──────────────────────────────────────────────────────────────
export function usePrefetchCustomer() {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);

    // 고객 상세 (RPC: 고객 + 처방전 + 주문 이력 한 번에)
    mutate(
      ['customer-full', id],
      async () => {
        const { data } = await supabase.rpc('get_customer_full_detail', {
          p_customer_id: id,
        });
        return data;
      },
      { revalidate: false }
    );
  }, []);

  return prefetch;
}

// ── 주문 프리페치 ──────────────────────────────────────────────────────────────
export function usePrefetchOrder() {
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetch = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);

    mutate(
      ['order', id],
      async () => {
        const { data } = await supabase
          .from('fo_orders')
          .select('*, customer:fo_customers(*), items:fo_order_items(*, product:fo_products(*))')
          .eq('id', id)
          .single();
        return data as Order;
      },
      { revalidate: false }
    );
  }, []);

  return prefetch;
}

// ── hover 이벤트 핸들러 생성 헬퍼 ─────────────────────────────────────────────
/**
 * 사용 예:
 *   const prefetch = usePrefetchFrame();
 *   <div {...prefetchHandlers(id, prefetch)}>...</div>
 */
export function prefetchHandlers(id: string, prefetchFn: (id: string) => void) {
  return {
    onMouseEnter: () => prefetchFn(id),
    onFocus: () => prefetchFn(id),
  };
}
