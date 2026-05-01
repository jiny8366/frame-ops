// Frame Ops — POS 결제 훅
// 정책 (강화):
//   - 어떤 실패(네트워크/서버/검증) 든 sync_queue 에 보관 후 자동 재시도에 위임.
//   - 결제 fetch 는 10초 타임아웃 — 멈춰있지 않고 빠르게 큐로 위임.
//   - 큐는 30초 주기 자동 flush + 우하단 배지로 항상 가시화 (PendingSyncBadge).
//   - 영구 dead-letter 폐기 — 어떤 판매도 잃어버리지 않도록 무한 재시도.

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { enqueueSync } from '@/lib/db/indexeddb';
import type { SaleInput } from '@/types';

const REQUEST_TIMEOUT_MS = 10_000;

interface CreateSaleApiResp {
  data: {
    sale_id: string;
    sold_at: string;
    total_amount: number;
    items_created: number;
  } | null;
  error: string | null;
}

async function postSaleWithTimeout(payload: SaleInput): Promise<CreateSaleApiResp> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('/api/sales/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as CreateSaleApiResp;
    if (!res.ok) {
      return { data: null, error: json.error ?? `HTTP ${res.status}` };
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// 환불 — fo_sale_items 의 CHECK quantity > 0 제약 때문에 sale 테이블에 음수 qty 를 못 넣어
// /api/sales/refund 로 라우팅 (절대값 변환).
async function postRefundWithTimeout(payload: SaleInput): Promise<CreateSaleApiResp> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const refundPayload = {
      store_id: payload.store_id,
      items: payload.items.map((it) => ({
        product_id: it.product_id,
        quantity: Math.abs(it.quantity),
        unit_price: it.unit_price,
      })),
      // PaymentDialog 가 환불 시 cash/card 에 음수를 넣어 보냄 → 절대값으로 변환
      cash_amount: Math.abs(payload.cash_amount ?? 0),
      card_amount: Math.abs(payload.card_amount ?? 0),
      discount_total: Math.abs(payload.discount_total ?? 0),
      seller_user_id: payload.seller_user_id,
      seller_label: payload.seller_label,
      idempotency_key: payload.idempotency_key,
      returned_at: payload.sold_at ?? null,
    };
    const res = await fetch('/api/sales/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refundPayload),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      data: { return_id: string; returned_at: string; items_returned: number; total_refund: number } | null;
      error: string | null;
    };
    if (!res.ok) {
      return { data: null, error: json.error ?? `HTTP ${res.status}` };
    }
    if (!json.data) return { data: null, error: '환불 응답 없음' };
    // CreateSaleApiResp 형태로 정규화 (sale_id 자리에 return_id, total_amount 자리에 total_refund)
    return {
      data: {
        sale_id: json.data.return_id,
        sold_at: json.data.returned_at,
        total_amount: -Math.abs(json.data.total_refund),
        items_created: json.data.items_returned,
      },
      error: null,
    };
  } finally {
    clearTimeout(t);
  }
}

function isRefundPayload(payload: SaleInput): boolean {
  return payload.items.some((it) => it.quantity < 0);
}

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

    // 클라이언트 타임스탬프(밀리초) 항상 부여 — 큐 보관 후 늦게 업로드돼도
    // 실제 판매 시점이 보존됨 (서버 now() 사용 시 통계 시간이 어긋남).
    // 사용자가 미리 sold_at 을 지정한 경우(과거 일자 보정 등) 그대로 유지.
    const stamped: SaleInput = {
      ...saleData,
      sold_at: saleData.sold_at ?? new Date().toISOString(),
    };

    // 1) 오프라인이면 즉시 큐잉 (재시도 위임)
    if (!isOnline()) {
      await queueOffline(stamped);
      toast.info('오프라인 — 네트워크 복구 시 자동 재시도됩니다.', { duration: 4000 });
      return false;
    }

    // 2) 온라인 — 환불 vs 판매 라우팅
    const isRefund = isRefundPayload(stamped);
    try {
      const { data, error } = isRefund
        ? await postRefundWithTimeout(stamped)
        : await postSaleWithTimeout(stamped);

      if (error) {
        console.error('[useCheckout] API error:', error);
        await queueOffline(stamped);
        toast.warning(
          `${isRefund ? '환불' : '판매'} 등록 보류 — ${error}. 자동 재시도 중 (우하단 배지).`,
          { duration: 6000 }
        );
        return false;
      }
      if (!data) {
        console.error('[useCheckout] empty response — 큐로 보관');
        await queueOffline(stamped);
        toast.warning('응답이 비어있어 큐로 보관 — 자동 재시도 중 (우하단 배지).', {
          duration: 6000,
        });
        return false;
      }

      toast.success(isRefund ? '환불 완료' : '판매 완료', { duration: 2000 });
      return true;
    } catch (err) {
      // 타임아웃 / 네트워크 예외 — 큐로 보관
      console.error('[useCheckout] fetch exception:', err);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const msg = isTimeout
        ? `응답 지연(${REQUEST_TIMEOUT_MS / 1000}초 초과)`
        : err instanceof Error
          ? err.message
          : String(err);
      await queueOffline(stamped);
      toast.warning(
        `판매 등록 보류 — ${msg}. 자동 재시도 중 (우하단 배지).`,
        { duration: 6000 }
      );
      return false;
    }
  }, []);

  return { submit };
}
