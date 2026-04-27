// Frame Ops — 전역 Provider 래퍼
// ThemeProvider + SWRConfig (IDB 프리로드 fallback 주입) + 오프라인 동기화 초기화

'use client';

import { SWRConfig, unstable_serialize } from 'swr';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppShellSkeleton } from '@/components/AppShellSkeleton';
import { getDeadLetterItems, initSyncListeners, retryDeadLetter } from '@/lib/db/sync';
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

    const cleanup = initSyncListeners((deadItem) => {
      const label =
        deadItem.table === 'orders' ? '판매 저장' :
        deadItem.table === 'sales'  ? '판매 등록' :
        deadItem.table === 'frames' ? '제품 업데이트' :
        '데이터';
      toast.error(`${label} 동기화 실패 (3회 재시도)`, {
        description: '네트워크 확인 후 수동 재전송 필요',
        duration: 8000,
      });
      console.warn('[FrameOps Sync] Dead letter:', deadItem);
    });

    // 앱 부팅 시 누적된 dead letter 자동 재시도 1회
    // 이전 버전 useCheckout 의 잘못된 큐잉으로 쌓인 판매가 통계에 누락된 케이스 복구.
    void (async () => {
      try {
        const dead = await getDeadLetterItems();
        if (dead.length > 0) {
          console.info(`[FrameOps Sync] Dead letter ${dead.length}건 — 자동 재시도`);
          for (const it of dead) {
            if (it.id !== undefined) await retryDeadLetter(it.id);
          }
        }
      } catch (e) {
        console.warn('[FrameOps Sync] Dead letter 복구 실패:', e);
      }
    })();

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
        {/* Phase 2: sonner Toast — 결제 완료/실패, Dead Letter 등 UI 알림 */}
        <Toaster
          position="top-center"
          richColors
          closeButton
          expand={false}
          toastOptions={{
            style: {
              fontSize: '15px',
            },
          }}
        />
      </SWRConfig>
    </ThemeProvider>
  );
}
