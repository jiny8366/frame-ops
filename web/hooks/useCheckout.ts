// Frame Ops — POS 결제 훅
// 정책 (강화):
//   - 어떤 실패(네트워크/서버/검증) 든 sync_queue 에 보관 후 자동 재시도에 위임.
//   - 결제 fetch 는 10초 타임아웃 — 멈춰있지 않고 빠르게 큐로 위임.
//   - 큐는 5초 주기 자동 flush + visibility/focus 트리거 + 우하단 배지로 가시화 (PendingSyncBadge).
//   - 영구 dead-letter 폐기 — 어떤 판매도 잃어버리지 않도록 무한 재시도.
//   - NEW: 첫 실패 시 1초 대기 후 인라인 재시도 1회 (idempotency_key 동일).
//     일시적 5xx/네트워크 블립을 큐 진입 전에 즉시 회수 → "미동기화" 발생 빈도 최소화.
//   - NEW: idempotency_key 가 누락된 경우 클라이언트에서 자동 부여 (방어적).

'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { enqueueSync } from '@/lib/db/indexeddb';
import type { SaleInput } from '@/types';

const REQUEST_TIMEOUT_MS = 10_000;
const INLINE_RETRY_DELAY_MS = 1_000;

interface CreateSaleApiResp {
  data: {
    sale_id: string;
    sold_at: string;
    total_amount: number;
    items_created: number;
  } | null;
  error: string | null;
  /** HTTP 상태 — 인라인 재시도/큐잉 분기에 사용. 클라이언트 예외(네트워크/타임아웃) 면 0. */
  status?: number;
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
      return { data: null, error: json.error ?? `HTTP ${res.status}`, status: res.status };
    }
    return { ...json, status: res.status };
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
      return { data: null, error: json.error ?? `HTTP ${res.status}`, status: res.status };
    }
    if (!json.data) return { data: null, error: '환불 응답 없음', status: res.status };
    // CreateSaleApiResp 형태로 정규화 (sale_id 자리에 return_id, total_amount 자리에 total_refund)
    return {
      data: {
        sale_id: json.data.return_id,
        sold_at: json.data.returned_at,
        total_amount: -Math.abs(json.data.total_refund),
        items_created: json.data.items_returned,
      },
      error: null,
      status: res.status,
    };
  } finally {
    clearTimeout(t);
  }
}

function isRefundPayload(payload: SaleInput): boolean {
  return payload.items.some((it) => it.quantity < 0);
}

/** 4xx 는 인라인 재시도 의미 없음 (validation/auth) → 즉시 큐잉. */
function isTransientStatus(status: number | undefined): boolean {
  if (status === undefined || status === 0) return true; // 네트워크 예외 — transient
  if (status >= 500) return true;
  if (status === 408 || status === 429) return true;     // 타임아웃/스로틀
  if (status === 401) return true;                        // 세션 만료 가능 — 새로고침/재로그인 후 재시도 의미 있음
  return false;
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

function ensureIdempotencyKey(payload: SaleInput): SaleInput {
  if (payload.idempotency_key && payload.idempotency_key.length > 0) return payload;
  return {
    ...payload,
    idempotency_key: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
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
    // idempotency_key 도 방어적으로 부여 — 서버는 동일 키 재요청을 멱등 처리.
    const stamped: SaleInput = ensureIdempotencyKey({
      ...saleData,
      sold_at: saleData.sold_at ?? new Date().toISOString(),
    });

    // 1) 오프라인이면 즉시 큐잉 (재시도 위임)
    if (!isOnline()) {
      await queueOffline(stamped);
      toast.info('오프라인 — 네트워크 복구 시 자동 재시도됩니다.', { duration: 4000 });
      return false;
    }

    // 2) 온라인 — 환불 vs 판매 라우팅
    const isRefund = isRefundPayload(stamped);
    const callApi = () =>
      isRefund ? postRefundWithTimeout(stamped) : postSaleWithTimeout(stamped);

    let lastError: string | undefined;
    let lastStatus: number | undefined;

    // 2-A) 1차 시도
    try {
      const { data, error, status } = await callApi();
      if (!error && data) {
        toast.success(isRefund ? '환불 완료' : '판매 완료', { duration: 2000 });
        return true;
      }
      lastError = error ?? '응답 없음';
      lastStatus = status;
    } catch (err) {
      // 타임아웃 / 네트워크 예외
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      lastError = isTimeout
        ? `응답 지연(${REQUEST_TIMEOUT_MS / 1000}초 초과)`
        : err instanceof Error
          ? err.message
          : String(err);
      lastStatus = 0;
    }

    // 2-B) 일시적 오류(5xx/네트워크/타임아웃/429/408/401) → 1초 대기 후 인라인 재시도 1회.
    //      동일 idempotency_key 로 안전 (서버가 중복 처리 방지).
    if (isTransientStatus(lastStatus)) {
      console.warn(
        `[useCheckout] 1차 실패 (status=${lastStatus ?? 'exception'}) — 1초 후 자동 재시도:`,
        lastError
      );
      await new Promise((r) => setTimeout(r, INLINE_RETRY_DELAY_MS));
      try {
        const { data, error, status } = await callApi();
        if (!error && data) {
          toast.success(isRefund ? '환불 완료' : '판매 완료', { duration: 2000 });
          return true;
        }
        lastError = error ?? '응답 없음';
        lastStatus = status;
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        lastError = isTimeout
          ? `응답 지연(${REQUEST_TIMEOUT_MS / 1000}초 초과)`
          : err instanceof Error
            ? err.message
            : String(err);
        lastStatus = 0;
      }
    }

    // 2-C) 여전히 실패 — 큐로 위임. 사용자에겐 자동 재시도 진행 중임을 안내.
    console.error(`[useCheckout] 큐 위임 (status=${lastStatus ?? 'exception'}):`, lastError);
    await queueOffline(stamped);
    toast.warning(
      `${isRefund ? '환불' : '판매'} 자동 재시도 중 — ${lastError ?? '서버 응답 지연'}`,
      {
        description: '네트워크가 복구되면 자동으로 등록됩니다. (우하단 배지 확인)',
        duration: 5000,
      }
    );
    // 큐잉됐어도 사용자 흐름을 막지 않도록 false 반환 — POS 페이지는 카트 유지하여 사용자 결정에 맡김
    return false;
  }, []);

  return { submit };
}
