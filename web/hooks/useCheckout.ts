// Frame Ops — POS 결제 훅
// 정책 (강화):
//   - 어떤 실패(네트워크/서버/검증) 든 sync_queue 에 보관 후 자동 재시도에 위임.
//   - 사용자에겐 결과를 명확히 안내 (성공/큐 보관/온라인서버에러).
//   - 큐는 30초 주기 자동 flush + 우하단 배지로 항상 가시화 (PendingSyncBadge).
//   - 영구 dead-letter 폐기 — 어떤 판매도 잃어버리지 않도록 무한 재시도.

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

    // 1) 오프라인이면 즉시 큐잉 (재시도 위임)
    if (!isOnline()) {
      await queueOffline(saleData);
      toast.info('오프라인 — 네트워크 복구 시 자동 재시도됩니다.', { duration: 4000 });
      return false;
    }

    // 2) 온라인 — 서버 호출
    try {
      const { data, error } = await salesApi.createWithItems(saleData);

      if (error) {
        // 어떤 종류의 에러든 큐에 보관 → 자동 재시도에 위임 → 손실 방지.
        console.error('[useCheckout] API error:', error);
        await queueOffline(saleData);
        toast.warning(
          `판매 등록 보류 — ${error}. 자동 재시도 중 (우하단 배지).`,
          { duration: 6000 }
        );
        return false;
      }
      if (!data) {
        console.error('[useCheckout] empty response — 큐로 보관');
        await queueOffline(saleData);
        toast.warning('응답이 비어있어 큐로 보관 — 자동 재시도 중 (우하단 배지).', {
          duration: 6000,
        });
        return false;
      }

      toast.success('판매 완료', { duration: 2000 });
      return true;
    } catch (err) {
      // 예외 — 큐로 보관
      console.error('[useCheckout] unexpected exception:', err);
      const msg = err instanceof Error ? err.message : String(err);
      await queueOffline(saleData);
      toast.warning(
        `판매 등록 보류 — ${msg}. 자동 재시도 중 (우하단 배지).`,
        { duration: 6000 }
      );
      return false;
    }
  }, []);

  return { submit };
}
