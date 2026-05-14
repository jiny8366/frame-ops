// Frame Ops Web — 오프라인 동기화
// sync_queue에 쌓인 변경사항을 API Routes를 통해 서버에 전송
// Supabase 직접 호출 없음
//
// 정책 (강화):
//   - 어떤 판매도 영구 손실되지 않도록 재시도를 포기하지 않음.
//   - 진행 backoff: 5s / 10s / 30s / 60s / 120s / 300s (cap)
//   - 다중 트리거: online / visibilitychange / focus / 주기적 5s 검사 (큐 비어있을 때는 cheap-skip)
//   - 4xx 영구 오류는 'invalid' 로 마킹 — 무한 재시도 비용 절감, 사용자에게 메타 노출
//   - 동시 flush 방지 뮤텍스(_flushingPromise) 도입
//
// "미동기화 사례 자동 처리" 요구 반영:
//   - 트리거 빈도 ↑ (30s → 5s 기본 + 이벤트 트리거 다수)
//   - 첫 재시도가 즉시(5s) 일어나므로 사용자가 배지를 볼 시간조차 거의 없음
//   - 4xx 분류로 영구 오류만 사용자 노출, 일시 오류는 자동 회수

'use client';

import {
  enqueueSync,
  getSyncQueue,
  deleteSyncItem,
  putSyncItem,
  dbPut,
  type SyncQueueItem,
  type SyncStatus,
} from './indexeddb';

// ── 상태 ──────────────────────────────────────────────────────────────────────
let _flushingPromise: Promise<void> | null = null;
let _listenersAttached = false;
let _deadLetterCallback: ((item: SyncQueueItem) => void) | null = null;
let _periodicTimerId: ReturnType<typeof setInterval> | null = null;
/** retry_count → 다음 시도 대기 (ms). retry_count=0 (방금 큐잉) 은 0 → 즉시 재시도. */
const BACKOFF_MS_BY_RETRY = [0, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000];
const PERIODIC_INTERVAL_MS = 5_000; // 5s — 큐 비어있으면 즉시 종료 (cheap)
const ALERT_THRESHOLD = 5;          // 5회 이상 실패 시 사용자에게 토스트로 알림

function backoffFor(retryCount: number): number {
  if (retryCount <= 0) return 0;
  const idx = Math.min(retryCount, BACKOFF_MS_BY_RETRY.length - 1);
  return BACKOFF_MS_BY_RETRY[idx];
}

/** 다음 재시도 가능 시각 ISO. retry_count + last updated_at 기준. */
function nextRetryAtIso(item: SyncQueueItem): string {
  const base = item.updated_at ?? item.created_at ?? new Date().toISOString();
  const ms = Date.parse(base) + backoffFor(item.retry_count ?? 0);
  return new Date(ms).toISOString();
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function initSyncListeners(
  onDeadLetter?: (item: SyncQueueItem) => void
): () => void {
  if (_listenersAttached || typeof window === 'undefined') return () => {};
  _listenersAttached = true;
  _deadLetterCallback = onDeadLetter ?? null;

  const triggerFlush = (reason: string) => {
    if (!isOnline()) return;
    console.log(`[FrameOps Sync] flush 트리거: ${reason}`);
    flushSyncQueue().catch(console.error);
  };

  const handleOnline = () => triggerFlush('online');
  const handleOffline = () => {
    console.log('[FrameOps Sync] 오프라인 전환 — 큐에 보관');
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') triggerFlush('visibilitychange');
  };
  const handleFocus = () => triggerFlush('focus');

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibility);

  // 초기 부팅 — 즉시 플러시 시도
  if (navigator.onLine) triggerFlush('init');

  // 주기 검사 (cheap if empty). 큐 비어있으면 getSyncQueue 만 호출 후 종료.
  if (!_periodicTimerId) {
    _periodicTimerId = setInterval(() => {
      if (isOnline()) flushSyncQueue().catch(console.error);
    }, PERIODIC_INTERVAL_MS);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (_periodicTimerId !== null) {
      clearInterval(_periodicTimerId);
      _periodicTimerId = null;
    }
    _listenersAttached = false;
    _deadLetterCallback = null;
  };
}

// ── 쓰기 인터셉터 ─────────────────────────────────────────────────────────────
export async function writeWithSync<T extends Record<string, unknown>>(
  table: SyncQueueItem['table'],
  operation: SyncQueueItem['operation'],
  payload: T
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const item: Omit<SyncQueueItem, 'id'> = {
    table,
    operation,
    payload,
    created_at: now,
    retry_count: 0,
    status: 'pending',
    updated_at: now,
  };

  if (!isOnline()) {
    await enqueueSync(item);
    if (operation !== 'delete') await dbPut(table as 'frames' | 'sales', payload as never);
    return { success: true };
  }

  return applyViaApi(item);
}

// ── 큐 플러시 (뮤텍스로 동시 실행 방지) ───────────────────────────────────────
export async function flushSyncQueue(): Promise<void> {
  if (_flushingPromise) return _flushingPromise;
  if (!isOnline()) return;

  _flushingPromise = (async () => {
    try {
      const queue = await getSyncQueue();
      if (!queue.length) return;

      const now = Date.now();
      // FIFO + backoff 게이트 — 다음 재시도 시각이 지난 항목만 시도
      const pending = queue
        .filter((i) => i.status !== 'syncing' && i.status !== 'invalid')
        .filter((i) => Date.parse(nextRetryAtIso(i)) <= now)
        .sort((a, b) => {
          if (a.id !== undefined && b.id !== undefined) return a.id - b.id;
          return (a.created_at ?? '').localeCompare(b.created_at ?? '');
        });
      if (!pending.length) return;

      for (const item of pending) {
        if (item.id === undefined) continue;

        await putSyncItem({
          ...item,
          id: item.id,
          status: 'syncing',
          updated_at: new Date().toISOString(),
        });

        const result = await applyViaApi(item);

        if (result.success) {
          await deleteSyncItem(item.id);
          continue;
        }

        const retry_count = (item.retry_count ?? 0) + 1;
        const nowIso = new Date().toISOString();

        // 4xx 영구 오류 (validation/auth fix-needed) — 'invalid' 로 마킹.
        // 무한 재시도 비용 절감 + 사용자가 PendingSyncBadge 에서 진단 가능.
        // 단 401 은 세션 재발급 후 재시도 가능하므로 invalid 가 아닌 failed 로 유지.
        const status = result.status;
        const isPermanentClientErr =
          typeof status === 'number' &&
          status >= 400 &&
          status < 500 &&
          status !== 401 &&
          status !== 408 &&
          status !== 429;

        const nextStatus: SyncStatus = isPermanentClientErr ? 'invalid' : 'failed';

        const justCrossedAlertThreshold =
          !isPermanentClientErr && retry_count === ALERT_THRESHOLD;

        await putSyncItem({
          ...item,
          id: item.id,
          retry_count,
          status: nextStatus,
          last_error: result.error,
          updated_at: nowIso,
        });

        if (isPermanentClientErr) {
          console.warn(
            `[FrameOps Sync] ${item.table} 영구 오류 (status=${status}) — invalid 로 마킹 (id=${item.id}):`,
            result.error
          );
          // 영구 오류는 즉시 사용자에 노출 (수정 액션 필요)
          _deadLetterCallback?.({
            ...item,
            id: item.id,
            retry_count,
            status: nextStatus,
            last_error: result.error,
            updated_at: nowIso,
          });
        } else if (justCrossedAlertThreshold) {
          console.warn(
            `[FrameOps Sync] ${item.table} 동기화 ${retry_count}회 실패 — 자동 재시도 계속 (id=${item.id}):`,
            result.error
          );
          _deadLetterCallback?.({
            ...item,
            id: item.id,
            retry_count,
            status: nextStatus,
            last_error: result.error,
            updated_at: nowIso,
          });
        }
      }
    } finally {
      _flushingPromise = null;
    }
  })();

  return _flushingPromise;
}

// ── Dead Letter / Invalid 관리 API ───────────────────────────────────────────
export async function getDeadLetterItems(): Promise<SyncQueueItem[]> {
  const all = await getSyncQueue();
  return all.filter((i) => i.status === 'dead' || i.status === 'invalid');
}

export async function retryDeadLetter(id: number): Promise<void> {
  const all = await getSyncQueue();
  const item = all.find((i) => i.id === id);
  if (!item) return;

  await putSyncItem({
    ...item,
    id,
    status: 'pending',
    retry_count: 0,
    last_error: undefined,
    updated_at: new Date().toISOString(),
  });
  await flushSyncQueue();
}

export async function discardDeadLetter(id: number): Promise<void> {
  await deleteSyncItem(id);
}

/** UI 노출용 — 항목별 다음 재시도 ETA 계산. */
export function nextRetryEtaSeconds(item: SyncQueueItem): number {
  if (item.status === 'invalid' || item.status === 'dead') return -1;
  const next = Date.parse(nextRetryAtIso(item));
  return Math.max(0, Math.round((next - Date.now()) / 1000));
}

// ── API Routes를 통한 서버 적용 ───────────────────────────────────────────────
const TABLE_TO_ENDPOINT: Record<string, string> = {
  frames: '/api/products',
  orders: '/api/orders',          // DEPRECATED (Phase 2): 레거시 sync_queue 호환
  sales:  '/api/sales/create',    // Phase 2 표준: RPC create_sale_with_items
};

async function applyViaApi(
  item: SyncQueueItem | Omit<SyncQueueItem, 'id'>
): Promise<{ success: boolean; error?: string; status?: number }> {
  let endpoint = TABLE_TO_ENDPOINT[item.table];
  if (!endpoint) return { success: false, error: `알 수 없는 테이블: ${item.table}`, status: 400 };

  // 환불 라우팅 — 'sales' 테이블 큐 항목 중 음수 qty 가 있으면 /api/sales/refund 로 보냄.
  // payload 도 절대값 변환 + 환불 전용 형태로 변형.
  let payload = item.payload as Record<string, unknown>;
  if (item.table === 'sales' && Array.isArray(payload.items)) {
    const items = payload.items as Array<{ product_id: string; quantity: number; unit_price: number; discount_amount?: number }>;
    const isRefund = items.some((it) => it.quantity < 0);
    if (isRefund) {
      endpoint = '/api/sales/refund';
      payload = {
        store_id: payload.store_id,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: Math.abs(it.quantity),
          unit_price: it.unit_price,
        })),
        cash_amount: Math.abs((payload.cash_amount as number) ?? 0),
        card_amount: Math.abs((payload.card_amount as number) ?? 0),
        discount_total: Math.abs((payload.discount_total as number) ?? 0),
        seller_user_id: payload.seller_user_id ?? null,
        seller_label: payload.seller_label ?? null,
        idempotency_key: payload.idempotency_key,
        returned_at: payload.sold_at ?? null,
      };
    }
  }

  // 재시도도 10초 타임아웃 — 멈춤 방지.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const method = item.operation === 'insert' ? 'POST'
      : item.operation === 'update'  ? 'PUT'
      : 'DELETE';

    const res = await fetch(
      method === 'DELETE'
        ? `${endpoint}/${(payload as Record<string, unknown>).id}`
        : endpoint,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${res.status}`, status: res.status };
    }
    return { success: true, status: res.status };
  } catch (e) {
    return { success: false, error: String(e), status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
