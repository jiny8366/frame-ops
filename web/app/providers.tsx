// Frame Ops — 전역 Provider 래퍼
// ThemeProvider + SWRConfig (IDB 프리로드 fallback 주입) + 오프라인 동기화 초기화

'use client';

import { SWRConfig, unstable_serialize } from 'swr';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppShellSkeleton } from '@/components/AppShellSkeleton';
import { PendingSyncBadge } from '@/components/PendingSyncBadge';
import { TransferInboxDialog } from '@/components/transfers/TransferInboxDialog';
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
      // 정책 변경: dead-letter 가 아닌 임계치 도달 알림.
      // 자동 재시도는 30초 주기로 계속 진행 중. 사용자에겐 이상 신호로만 노출.
      toast.warning(`${label} 동기화 ${deadItem.retry_count}회 실패 — 자동 재시도 계속`, {
        description: '네트워크 상태/서버 점검을 확인하세요. 우하단 배지로 큐 확인 가능.',
        duration: 8000,
      });
      console.warn('[FrameOps Sync] 누적 실패:', deadItem);
    });

    // 앱 부팅 시 누적된 dead 항목(과거 정책 산물) 도 강제 재시도 큐에 복귀
    // 신규 정책에서는 dead 가 발생하지 않지만 구버전 데이터 호환.
    void (async () => {
      try {
        const dead = await getDeadLetterItems();
        if (dead.length > 0) {
          console.info(`[FrameOps Sync] dead 잔존 ${dead.length}건 — 재시도 큐로 복귀`);
          for (const it of dead) {
            if (it.id !== undefined) await retryDeadLetter(it.id);
          }
        }
      } catch (e) {
        console.warn('[FrameOps Sync] dead 복구 실패:', e);
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
        {/* 미동기화 판매 배지 — 우하단 고정, 큐 비어있으면 미렌더 */}
        <PendingSyncBadge />
        {/* 점간이동 받은 전표함 팝업 — 미처리 전표 있으면 자동 표시 */}
        <TransferInboxDialog />
        {/* sonner Toast — 결제 완료/실패, 동기화 알림 등 */}
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
