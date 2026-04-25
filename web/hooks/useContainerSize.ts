// Frame Ops — 컨테이너 크기 추적 훅
// ResizeObserver + orientationchange 기반, SSR-safe

'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ContainerSize {
  width: number;
  height: number;
}

export interface UseContainerSizeReturn<T extends HTMLElement> extends ContainerSize {
  ref: RefObject<T>;
}

/**
 * 컨테이너의 실제 크기를 추적한다.
 * - ResizeObserver로 부모 크기 변화 감지
 * - orientationchange, resize 이벤트 구독
 * - SSR-safe (마운트 전에는 0 반환)
 *
 * @param offsetHeight - 아래쪽에서 제외할 고정 영역 높이 (예: 하단 탭바)
 */
export function useContainerSize<T extends HTMLElement>(
  offsetHeight: number = 0
): UseContainerSizeReturn<T> {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: Math.max(0, window.innerHeight - rect.top - offsetHeight),
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(element);

    const handleViewportChange = () => {
      // 회전 애니메이션이 끝난 뒤 측정
      requestAnimationFrame(updateSize);
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, [offsetHeight]);

  return { ref, ...size };
}
