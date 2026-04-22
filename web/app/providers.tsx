// Frame Ops — 전역 Provider 래퍼
// ThemeProvider + SWRConfig (IDB 프리로드 fallback 주입) + 오프라인 동기화 초기화

'use client';

import { SWRConfig, unstable_serialize } from 'swr';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppShellSkeleton } from '@/components/AppShellSkeleton';
import { initSyncListeners } from '@/lib/db/sync';
import { dbGetAll } from '@/lib/db/indexeddb';
import type { Product } from '@/types';

interface ProvidersProps {
  children: ReactNode;
}

// useFramesData({ search: '' })의 초기 SWR 키와 정확히 일치해야 fallback이 적중한다.
// 변경 시 useFramesData의 cacheKey 구성과 동기화할 것.
const FRAMES_INITIAL_KEY = unstable_serialize(['frames', JSON.stringify({ search: '' })]);

export function Providers({ children }: ProvidersProps) {
  const [fallback, setFallback] = useState<Record<string, unknown>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cached = await dbGetAll<Product>('frames');
        if (cancelled) return;
        if (cached.length > 0) {
          setFallback({ [FRAMES_INITIAL_KEY]: cached });
        }
      } catch (e) {
        console.warn('[Providers] IDB 프리로드 실패:', e);
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();

    const cleanup = initSyncListeners();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  if (!initialized) {
    return (
      <ThemeProvider>
        <AppShellSkeleton />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SWRConfig
        value={{
          fallback,
          dedupingInterval: 2000,
          revalidateOnFocus: true,
          revalidateOnReconnect: true,
          errorRetryCount: 3,
          errorRetryInterval: 5000,
          onError(error, key) {
            if (process.env.NODE_ENV === 'development') {
              console.error(`[SWR Error] key=${String(key)}`, error);
            }
          },
        }}
      >
        {children}
      </SWRConfig>
    </ThemeProvider>
  );
}
