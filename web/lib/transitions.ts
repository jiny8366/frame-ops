// Frame Ops — View Transitions API 유틸리티
// 지원 브라우저: Chrome 111+, Edge 111+ / 미지원 시 즉시 실행 폴백

/**
 * View Transitions API 지원 여부 확인
 */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document
  );
}

/**
 * 뷰 전환 래퍼
 * - 지원: document.startViewTransition() 사용
 * - 미지원: 콜백 즉시 실행 (무애니메이션 폴백)
 */
export async function startTransition(callback: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions()) {
    await callback();
    return;
  }

  const transition = document.startViewTransition(callback);

  try {
    await transition.ready;
  } catch {
    // 전환 취소 시 무시
  }
}

/**
 * Next.js router.push 래퍼 — View Transition과 함께 사용
 *
 * 사용 예:
 *   import { useRouter } from 'next/navigation';
 *   const router = useRouter();
 *   <button onClick={() => navigateWithTransition(router.push, '/frames/123')}>
 */
export function navigateWithTransition(
  pushFn: (url: string) => void,
  url: string
): void {
  startTransition(() => pushFn(url));
}
