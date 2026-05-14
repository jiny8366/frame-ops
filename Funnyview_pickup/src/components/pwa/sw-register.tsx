'use client';

import { useEffect } from 'react';

/**
 * 서비스 워커 등록. 클라이언트 마운트 시 1회 실행.
 * 개발 환경에서는 캐시 충돌 회피용으로도 등록은 하지만,
 * Next dev 모드에서 SW 가 페이지를 가로채면 새로고침 필요.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 무시
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
