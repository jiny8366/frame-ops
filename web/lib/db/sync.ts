// Frame Ops Web — 오프라인 동기화
// sync_queue에 쌓인 변경사항을 API Routes를 통해 서버에 전송
// Supabase 직접 호출 없음
//
// TASK 8 변경점:
//   - 3회 실패 시 silent delete → status='dead'로 보존 + onDeadLetter 콜백 호출
//   - 동시 flush 방지 뮤텍스(_flushingPromise) 도입
//   - getDeadLetterItems / retryDeadLetter / discardDeadLetter 관리 API 노출

'use client';

import {
  enqueueSync,
  getSyncQueue,
  deleteSyncItem,
  putSyncItem,
  dbPut,
  type SyncQueueItem,
} from './indexeddb';

// ── 상태 ──────────────────────────────────────────────────────────────────────
let _flushingPromise: Promise<void> | null = null;
let _listenersAttached = false;
let _deadLetterCallback: ((item: SyncQueueItem) => void) | null = null;
let _periodicTimerId: ReturnType<typeof setInterval> | null = null;

// 정책: 어떤 판매도 영구 손실되지 않도록 재시도를 포기하지 않음.
//   - 30초 주기 자동 재시도 (큐 비어있어도 cheap, 빠른 검사 후 종료)
//   - retry_count 가 임계치를 넘어도 'dead' 가 아닌 'failed' 유지 (다음 주기 재시도)
//   - 단, 실패 누적 시 콘솔 경고 + dead-letter 콜백으로 사용자에게 노출
const PERIODIC_INTERVAL_MS = 30 * 1000;
const ALERT_THRESHOLD = 5; // 5회 이상 실패 시 사용자에게 토스트로 알림

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function initSyncListeners(
  onDeadLetter?: (item: SyncQueueItem) => void
): () => void {
  if (_listenersAttached || typeof window === 'undefined') return () => {};
  _listenersAttached = true;
  _deadLetterCallback = onDeadLetter ?? null;

  const handleOnline = () => {
    console.log('[FrameOps Sync] 온라인 복귀 — 동기화 시작');
    flushSyncQueue().catch(console.error);
  };
  const handleOffline = () => {
    console.log('[FrameOps Sync] 오프라인 전환 — 큐에 저장합니다');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  if (navigator.onLine) flushSyncQueue().catch(console.error);

  // 30초 주기 자동 재시도 — 큐 비어있어도 빠른 검사 후 종료.
  // 어떤 판매도 영구 손실되지 않도록 보장.
  if (!_periodicTimerId) {
    _periodicTimerId = setInterval(() => {
      if (isOnline()) flushSyncQueue().catch(console.error);
    }, PERIODIC_INTERVAL_MS);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
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
      // 'syncing' 만 건너뜀(다른 인스턴스가 처리 중일 가능성).
      // 'dead' 는 자동 회복 정책 — 항상 재시도 후보에 포함.
      const pending = queue.filter((i) => i.status !== 'syncing');
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
        const now = new Date().toISOString();

        // 정책: 영구 dead 처리하지 않음 — 항상 status='failed' 로 남겨 다음 주기 재시도.
        // 일정 횟수 이상 실패 시 사용자에게 한 번 알림(중복 알림 방지를 위해 임계치 동일 시점 1회).
        const justCrossedAlertThreshold =
          retry_count === ALERT_THRESHOLD;

        await putSyncItem({
          ...item,
          id: item.id,
          retry_count,
          status: 'failed',
          last_error: result.error,
          updated_at: now,
        });

        if (justCrossedAlertThreshold) {
          console.warn(
            `[FrameOps Sync] ${item.table} 동기화 ${retry_count}회 실패 — 자동 재시도 계속 (id=${item.id}):`,
            result.error
          );
          _deadLetterCallback?.({
            ...item,
            id: item.id,
            retry_count,
            status: 'failed',
            last_error: result.error,
            updated_at: now,
          });
        }
      }
    } finally {
      _flushingPromise = null;
    }
  })();

  return _flushingPromise;
}

// ── Dead Letter 관리 API ─────────────────────────────────────────────────────
export async function getDeadLetterItems(): Promise<SyncQueueItem[]> {
  const all = await getSyncQueue();
  return all.filter((i) => i.status === 'dead');
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

// ── API Routes를 통한 서버 적용 ───────────────────────────────────────────────
const TABLE_TO_ENDPOINT: Record<string, string> = {
  frames: '/api/products',
  orders: '/api/orders',          // DEPRECATED (Phase 2): 레거시 sync_queue 호환
  sales:  '/api/sales/create',    // Phase 2 표준: RPC create_sale_with_items
};

async function applyViaApi(
  item: SyncQueueItem | Omit<SyncQueueItem, 'id'>
): Promise<{ success: boolean; error?: string }> {
  const endpoint = TABLE_TO_ENDPOINT[item.table];
  if (!endpoint) return { success: false, error: `알 수 없는 테이블: ${item.table}` };

  try {
    const method = item.operation === 'insert' ? 'POST'
      : item.operation === 'update'  ? 'PUT'
      : 'DELETE';

    const res = await fetch(
      method === 'DELETE'
        ? `${endpoint}/${(item.payload as Record<string, unknown>).id}`
        : endpoint,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify(item.payload) : undefined,
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
