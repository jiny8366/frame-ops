// Frame Ops Web — 오프라인 동기화
// sync_queue에 쌓인 변경사항을 API Routes를 통해 서버에 전송
// Supabase 직접 호출 없음

'use client';

import {
  enqueueSync,
  getSyncQueue,
  deleteSyncItem,
  dbPut,
  type SyncQueueItem,
} from './indexeddb';

// ── 상태 ──────────────────────────────────────────────────────────────────────
let _isSyncing = false;
let _listenersAttached = false;

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function initSyncListeners(): () => void {
  if (_listenersAttached || typeof window === 'undefined') return () => {};
  _listenersAttached = true;

  const handleOnline = () => {
    console.log('[FrameOps Sync] 온라인 복귀 — 동기화 시작');
    flushSyncQueue();
  };
  const handleOffline = () => {
    console.log('[FrameOps Sync] 오프라인 전환 — 큐에 저장합니다');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  if (navigator.onLine) flushSyncQueue();

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    _listenersAttached = false;
  };
}

// ── 쓰기 인터셉터 ─────────────────────────────────────────────────────────────
export async function writeWithSync<T extends Record<string, unknown>>(
  table: SyncQueueItem['table'],
  operation: SyncQueueItem['operation'],
  payload: T
): Promise<{ success: boolean; error?: string }> {
  const item: Omit<SyncQueueItem, 'id'> = {
    table, operation, payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };

  if (!isOnline()) {
    await enqueueSync(item);
    if (operation !== 'delete') await dbPut(table, payload as never);
    return { success: true };
  }

  return applyViaApi(item);
}

// ── 큐 플러시 ─────────────────────────────────────────────────────────────────
export async function flushSyncQueue(): Promise<void> {
  if (_isSyncing || !isOnline()) return;
  _isSyncing = true;
  try {
    const queue = await getSyncQueue();
    if (!queue.length) return;

    for (const item of queue) {
      const result = await applyViaApi(item);
      if (result.success) {
        await deleteSyncItem(item.id!);
      } else if ((item.retry_count ?? 0) >= 3) {
        await deleteSyncItem(item.id!);
        console.error('[FrameOps Sync] 최대 재시도 초과 — 폐기:', item);
      }
    }
  } finally {
    _isSyncing = false;
  }
}

// ── API Routes를 통한 서버 적용 ───────────────────────────────────────────────
const TABLE_TO_ENDPOINT: Record<string, string> = {
  frames: '/api/products',
  orders: '/api/orders',   // fo_sales 테이블
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
