// Frame Ops — 오프라인 동기화 로직
// 오프라인 변경사항을 sync_queue에 쌓고, 온라인 복귀 시 Supabase와 동기화

'use client';

import { supabase } from '@/lib/supabase/client';
import {
  enqueueSync,
  getSyncQueue,
  deleteSyncItem,
  dbPut,
  type SyncQueueItem,
} from './indexeddb';

// ── 상태 ──────────────────────────────────────────────────────────────────────
let _isSyncing = false;
let _syncListenersAttached = false;

// ── 온라인 상태 감지 ──────────────────────────────────────────────────────────
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** online/offline 이벤트 리스너 등록 (앱 초기화 시 한 번만 호출) */
export function initSyncListeners(): () => void {
  if (_syncListenersAttached || typeof window === 'undefined') {
    return () => {};
  }
  _syncListenersAttached = true;

  const handleOnline = () => {
    console.log('[FrameOps Sync] 온라인 복귀 — 동기화 시작');
    flushSyncQueue();
  };

  const handleOffline = () => {
    console.log('[FrameOps Sync] 오프라인 전환 — 변경사항은 큐에 저장됩니다');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // 초기 온라인 상태라면 즉시 큐 플러시
  if (navigator.onLine) {
    flushSyncQueue();
  }

  // 클린업 함수 반환
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    _syncListenersAttached = false;
  };
}

// ── 쓰기 인터셉터 ─────────────────────────────────────────────────────────────
/**
 * Supabase에 쓰기 시도 → 오프라인이면 sync_queue에 저장
 * 온라인이면 Supabase에 직접 저장 후 IndexedDB도 업데이트
 */
export async function writeWithSync<T extends Record<string, unknown>>(
  table: SyncQueueItem['table'],
  operation: SyncQueueItem['operation'],
  payload: T
): Promise<{ success: boolean; error?: string }> {
  const item: Omit<SyncQueueItem, 'id'> = {
    table,
    operation,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };

  if (!isOnline()) {
    // 오프라인: 큐에 저장 + IndexedDB 낙관적 업데이트
    await enqueueSync(item);
    if (operation !== 'delete') {
      await dbPut(table, payload as never);
    }
    return { success: true };
  }

  // 온라인: Supabase 직접 호출
  return applyToSupabase(item);
}

// ── 큐 플러시 ─────────────────────────────────────────────────────────────────
export async function flushSyncQueue(): Promise<void> {
  if (_isSyncing || !isOnline()) return;
  _isSyncing = true;

  try {
    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[FrameOps Sync] ${queue.length}개 항목 동기화 중...`);

    for (const item of queue) {
      const result = await applyToSupabase(item);
      if (result.success) {
        await deleteSyncItem(item.id!);
      } else {
        console.error(`[FrameOps Sync] 실패 (id=${item.id}):`, result.error);
        // 최대 3회 재시도 후 포기
        if (item.retry_count >= 3) {
          await deleteSyncItem(item.id!);
          console.error('[FrameOps Sync] 최대 재시도 초과 — 항목 폐기');
        }
      }
    }

    console.log('[FrameOps Sync] 동기화 완료');
  } finally {
    _isSyncing = false;
  }
}

// ── Supabase 적용 ─────────────────────────────────────────────────────────────
async function applyToSupabase(
  item: SyncQueueItem | Omit<SyncQueueItem, 'id'>
): Promise<{ success: boolean; error?: string }> {
  try {
    let error: unknown = null;

    if (item.operation === 'insert') {
      ({ error } = await supabase.from(item.table).insert(item.payload));
    } else if (item.operation === 'update') {
      const { id, ...rest } = item.payload;
      ({ error } = await supabase.from(item.table).update(rest).eq('id', id));
    } else if (item.operation === 'delete') {
      ({ error } = await supabase.from(item.table).delete().eq('id', item.payload.id));
    }

    if (error) {
      return { success: false, error: String(error) };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
