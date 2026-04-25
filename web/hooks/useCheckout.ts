// Frame Ops — POS 결제 훅
// 결제 시 실제 서버 응답을 기다린 뒤 성공/실패 토스트. 실패 시 sync_queue 폴백.
// (이전: optimistic 즉시 성공 토스트 → 실패해도 사용자 인지 어려움. 신뢰성 우선으로 변경)

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { salesApi } from '@/lib/api-client';
import { enqueueSync } from '@/lib/db/indexeddb';
import type { SaleInput } from '@/types';

export interface UseCheckoutReturn {
  /** 성공이면 true, 실패(폴백 큐 보관 포함) 면 false. POS 페이지가 카트 비울지 결정. */
  submit: (saleData: SaleInput) => Promise<boolean>;
}

export function useCheckout(): UseCheckoutReturn {
  const submit = useCallback(async (saleData: SaleInput): Promise<boolean> => {
    if (!saleData.store_id) {
      toast.error('매장 정보가 없어 판매를 등록할 수 없습니다. 다시 로그인하세요.');
      return false;
    }

    try {
      const { data, error } = await salesApi.createWithItems(saleData);
      if (error) {
        console.error('[useCheckout] API error:', error);
        toast.error(`판매 등록 실패: ${error}`);

        // 네트워크 단절 가능성 — sync_queue 에 보관 (재전송)
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
        toast.info('네트워크 복구 시 자동 재전송됩니다.', { duration: 4000 });
        return false;
      }
      if (!data) {
        console.error('[useCheckout] empty response');
        toast.error('판매 등록 응답이 비어있습니다.');
        return false;
      }
      toast.success('판매 완료', { duration: 2000 });
      return true;
    } catch (err) {
      console.error('[useCheckout] exception:', err);
      const msg = err instanceof Error ? err.message : '네트워크 오류';
      toast.error(`판매 등록 실패: ${msg}`);

      // 네트워크 예외 — sync_queue 폴백
      try {
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
        toast.info('네트워크 복구 시 자동 재전송됩니다.', { duration: 4000 });
      } catch {
        // ignore IDB failure
      }
      return false;
    }
  }, []);

  return { submit };
}
