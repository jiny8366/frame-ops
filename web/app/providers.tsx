// Frame Ops — SWR 전역 설정 + 오프라인 동기화 초기화
'use client';

import { SWRConfig } from 'swr';
import { useEffect, type ReactNode } from 'react';
import { initSyncListeners } from '@/lib/db/sync';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // 오프라인 동기화 리스너 등록
  useEffect(() => {
    const cleanup = initSyncListeners();
    return cleanup;
  }, []);

  return (
    <SWRConfig
      value={{
        // 중복 요청 제거 간격: 2초
        dedupingInterval: 2000,
        // 포커스 복귀 시 재검증
        revalidateOnFocus: true,
        // 재연결 시 재검증
        revalidateOnReconnect: true,
        // 에러 재시도 횟수
        errorRetryCount: 3,
        // 에러 재시도 지연 (지수 백오프)
        errorRetryInterval: 5000,
        // 전역 에러 핸들러
        onError(error, key) {
          if (process.env.NODE_ENV === 'development') {
            console.error(`[SWR Error] key=${String(key)}`, error);
          }
        },
        // 전역 fetcher (기본값 — 각 훅에서 개별 fetcher 사용)
        fetcher: undefined,
      }}
    >
      {children}
    </SWRConfig>
  );
}
