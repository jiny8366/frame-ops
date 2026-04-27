// Frame Ops — POS 결제 훅
// 정책 (수정):
//   - 결제 시 네트워크 상태(navigator.onLine) 확인 후 분기:
//     · ONLINE 인데 API 가 에러를 돌려주면 → 서버/검증 에러 → 사용자에게 실제 메시지 노출
//        (sync_queue 큐잉 안 함: 재시도해도 같은 에러 반복하므로 misleading)
//     · OFFLINE 또는 fetch 자체가 실패 → sync_queue 보관 + '네트워크 복구 시 자동 재전송' 안내
//   - 성공 시 success 토스트 + true 반환 (호출자가 카트 비움)
//
// 이전 동작은 모든 실패에 동일 큐잉/재전송 안내가 떴고, 사용자는 sale 이 실제로
// 등록 안 됐는지 알기 어려웠음 + 통계에 안 보임 (큐 dead letter 도달 시 영영 누락 가능).

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

function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

async function queueOffline(saleData: SaleInput): Promise<void> {
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
  } catch {
    /* IDB 실패는 무시 — 사용자에겐 이미 에러 표시 */
  }
}

export function useCheckout(): UseCheckoutReturn {
  const submit = useCallback(async (saleData: SaleInput): Promise<boolean> => {
    if (!saleData.store_id) {
      toast.error('매장 정보가 없어 판매를 등록할 수 없습니다. 다시 로그인하세요.');
      return false;
    }

    // 1) 오프라인이면 즉시 큐잉
    if (!isOnline()) {
      await queueOffline(saleData);
      toast.info('오프라인 상태 — 네트워크 복구 시 자동 재전송됩니다.', { duration: 4000 });
      return false;
    }

    // 2) 온라인 — 서버 호출
    try {
      const { data, error } = await salesApi.createWithItems(saleData);

      if (error) {
        // fetch 도중 오프라인 전환됐을 가능성 — 다시 확인
        if (!isOnline()) {
          await queueOffline(saleData);
          toast.info('오프라인 — 네트워크 복구 시 자동 재전송됩니다.', { duration: 4000 });
          return false;
        }
        // 온라인 + 서버에러: 재시도해도 같은 결과 → 큐잉하지 않음
        console.error('[useCheckout] API error (online):', error);
        toast.error(`판매 등록 실패 — ${error}`, { duration: 6000 });
        return false;
      }
      if (!data) {
        console.error('[useCheckout] empty response');
        toast.error('판매 등록 응답이 비어있습니다. 다시 시도해 주세요.');
        return false;
      }

      toast.success('판매 완료', { duration: 2000 });
      return true;
    } catch (err) {
      // 안전망 — apiFetch 가 거의 모든 에러를 catch 하지만 만약을 위해
      console.error('[useCheckout] unexpected exception:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (!isOnline()) {
        await queueOffline(saleData);
        toast.info('오프라인 — 네트워크 복구 시 자동 재전송됩니다.', { duration: 4000 });
      } else {
        toast.error(`판매 등록 실패 — ${msg}`, { duration: 6000 });
      }
      return false;
    }
  }, []);

  return { submit };
}
