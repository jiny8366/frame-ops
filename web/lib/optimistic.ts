// Frame Ops Web — Optimistic Mutation 유틸
// SWR 캐시에 낙관적 데이터 즉시 반영 → 백그라운드 실제 호출 → 실패 시 롤백.
// Phase 2 POS 결제/장바구니 수정 등 사용자 액션의 즉각적 UI 반응을 위해.
//
// 사용:
//   await optimisticMutation({
//     key: ['frame', frameId],
//     optimisticData: { ...oldFrame, sale_price: newPrice },
//     mutation: () => productsApi.update(frameId, { sale_price: newPrice }),
//     rollbackData: oldFrame,
//   });

import { mutate as globalMutate } from 'swr';

export interface OptimisticMutationOptions<T> {
  /** SWR 캐시 키. ['frame', id] 같은 배열도 지원. */
  key: string | readonly unknown[];
  /** 즉시 UI 에 반영할 데이터. */
  optimisticData: T;
  /** 실제 서버 호출. 성공 시 반환값이 최종 캐시 상태가 됨. */
  mutation: () => Promise<T>;
  /** 실패 시 되돌릴 데이터. 일반적으로 optimistic 호출 직전 값. */
  rollbackData: T;
  /** 실패 콜백 (토스트 등). 호출 여부와 무관하게 예외는 상위로 re-throw. */
  onError?: (err: Error) => void;
}

export async function optimisticMutation<T>(
  options: OptimisticMutationOptions<T>
): Promise<T> {
  const { key, optimisticData, mutation, rollbackData, onError } = options;

  // ① 즉시 UI 에 optimistic 데이터 주입 (재검증 X)
  await globalMutate(key, optimisticData, { revalidate: false });

  try {
    // ② 백그라운드에서 실제 서버 호출
    const result = await mutation();

    // ③ 성공: 서버 응답으로 교체 (재검증 없음 — 서버가 최종값)
    await globalMutate(key, result, { revalidate: false });
    return result;
  } catch (err) {
    // ④ 실패: 롤백 + 선택적 에러 콜백
    await globalMutate(key, rollbackData, { revalidate: false });
    onError?.(err as Error);
    throw err;
  }
}
