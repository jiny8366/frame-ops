// Frame Ops — POS 결제 훅 (Optimistic UI)
// 결제 버튼 클릭 → 즉시 토스트 + 홈 라우팅 → 백그라운드 저장.
// 네트워크 실패 시 sync_queue 로 폴백 (오프라인 복원력).

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { salesApi } from '@/lib/api-client';
import { dbPut, enqueueSync } from '@/lib/db/indexeddb';
import type { SaleInput } from '@/types';

export interface UseCheckoutReturn {
  submit: (saleData: SaleInput) => Promise<void>;
}

export function useCheckout(): UseCheckoutReturn {
  const router = useRouter();

  const submit = useCallback(
    async (saleData: SaleInput): Promise<void> => {
      // ① 즉시 UI 반영 — 사용자는 다음 고객으로 바로 전환 가능
      toast.success('판매 완료', { duration: 2000 });
      router.push('/');

      try {
        // ② 백그라운드 저장 — 실패해도 UI 는 이미 넘어감
        // 참고: TASK 7 에서 salesApi.create 가 /api/sales/create RPC 로 전환.
        //       현재는 레거시 /api/orders 경로로 전송.
        const { data, error } = await salesApi.create(
          saleData as unknown as Record<string, unknown>
        );
        if (error) throw new Error(error);

        // ③ 성공: IndexedDB 백업 (오프라인 조회 캐시)
        if (data) {
          await dbPut('sales', data as never);
        }
      } catch (err) {
        // ④ 실패: sync_queue 에 enqueue → 온라인 복귀 시 자동 재전송
        //    (Phase 1 TASK 8 DLQ 가 3회 실패 후 status='dead' 보존)
        await enqueueSync({
          table: 'orders',
          operation: 'insert',
          payload: saleData as unknown as Record<string, unknown>,
          created_at: new Date().toISOString(),
          retry_count: 0,
          status: 'pending',
          updated_at: new Date().toISOString(),
        });

        toast.warning('네트워크 복구 시 자동 전송됩니다.', { duration: 4000 });
        // 에러를 console 에 남기되 상위로 re-throw 하지 않음.
        // 사용자는 이미 다음 고객 응대 중이므로 UI 에서 차단하지 않음.
        console.error('[useCheckout] 백그라운드 저장 실패, sync_queue 에 보관:', err);
      }
    },
    [router]
  );

  return { submit };
}
