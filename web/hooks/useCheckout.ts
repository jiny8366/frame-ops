// Frame Ops — POS 결제 훅 (Optimistic UI)
// 결제 버튼 클릭 → 즉시 토스트 + 홈 라우팅 → 백그라운드 저장.
// 네트워크 실패 시 sync_queue 로 폴백 (오프라인 복원력).

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { salesApi } from '@/lib/api-client';
import { enqueueSync } from '@/lib/db/indexeddb';
import type { SaleInput } from '@/types';

export interface UseCheckoutReturn {
  submit: (saleData: SaleInput) => Promise<void>;
}

export function useCheckout(): UseCheckoutReturn {
  const submit = useCallback(
    async (saleData: SaleInput): Promise<void> => {
      // ① 즉시 UI 반영 — POS 화면 잔류, 카트 비움은 호출자가 처리
      toast.success('판매 완료', { duration: 2000 });

      try {
        // ② 백그라운드 저장 — RPC create_sale_with_items 통해
        //    fo_sales + fo_sale_items + stock_quantity 차감 원자 처리.
        const { data, error } = await salesApi.createWithItems(saleData);
        if (error) throw new Error(error);
        if (!data) throw new Error('서버 응답이 비어있습니다.');

        // 성공: 별도 IDB 백업 없음. RPC 가 모든 부수효과 처리.
        // (Phase 1 의 fo_sales raw insert 경로와 달리 RPC 는 sale_id 만 반환)
      } catch (err) {
        // ③ 실패: sync_queue 'sales' table 로 enqueue → /api/sales/create 재전송
        //    (Phase 1 TASK 8 DLQ 가 3회 실패 후 status='dead' 보존)
        const now = new Date().toISOString();
        await enqueueSync({
          table: 'sales',
          operation: 'insert',
          payload: saleData as unknown as Record<string, unknown>,
          created_at: now,
          retry_count: 0,
          status: 'pending',
          updated_at: now,
        });

        toast.warning('네트워크 복구 시 자동 전송됩니다.', { duration: 4000 });
        // 사용자는 이미 다음 고객 응대 중이므로 UI 에서 차단하지 않음.
        console.error('[useCheckout] 백그라운드 저장 실패, sync_queue 에 보관:', err);
      }
    },
    []
  );

  return { submit };
}
