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
//
// 자가 회복 (2026-04-27 추가):
//   - Zombie 'syncing' 회복: 탭 종료/크래시로 status='syncing' 멈춘 항목을
//     ZOMBIE_THRESHOLD_MS 초과 시 'failed' 로 강제 복귀 → 다음 flush 에서 재시도.
//   - 영구 오류 자동 정리: 페이로드 결함(필수 필드 누락 등) 으로 절대 풀 수 없는
//     항목은 retry_count >= PERMANENT_ERROR_THRESHOLD 도달 시 큐에서 제거.
const PERIODIC_INTERVAL_MS = 30 * 1000;
const ALERT_THRESHOLD = 5; // 5회 이상 실패 시 사용자에게 토스트로 알림
const ZOMBIE_THRESHOLD_MS = 60 * 1000; // status='syncing' 60초 초과 시 좀비로 간주
const PERMANENT_ERROR_THRESHOLD = 5; // 영구 오류 패턴 + 5회 이상 실패 → 자동 삭제

// 영구 오류 패턴 — 재시도해도 절대 성공할 수 없는 결함.
// (구버전 큐의 페이로드 형태 결함, 알 수 없는 테이블, 클라이언트 검증 거부 등)
const PERMANENT_ERROR_PATTERNS: readonly RegExp[] = [
  /idempotency_key.*필수/i,
  /items.*최소 1개/i,
  /알 수 없는 테이블/i,
  /HTTP 400/i,
  /HTTP 422/i,
  /Invalid.*payload/i,
];

function isPermanentError(error: string | undefined): boolean {
  if (!error) return false;
  return PERMANENT_ERROR_PATTERNS.some((p) => p.test(error));
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
      const rawQueue = await getSyncQueue();
      const nowMs = Date.now();

      // ── 자가 회복 1: Zombie 'syncing' 복구 ────────────────────────────────
      // 이전 탭/세션이 'syncing' 상태 갱신 후 크래시/종료된 항목은
      // 다음 flush 에서 status !== 'syncing' 필터에 의해 영구 제외된다.
      // updated_at 이 ZOMBIE_THRESHOLD_MS 초과면 'failed' 로 강제 복귀.
      for (const item of rawQueue) {
        if (item.status !== 'syncing' || item.id === undefined) continue;
        const ts = item.updated_at ? Date.parse(item.updated_at) : 0;
        if (Number.isFinite(ts) && nowMs - ts > ZOMBIE_THRESHOLD_MS) {
          console.warn(
            `[FrameOps Sync] zombie 'syncing' 회복 (id=${item.id}, ${
              Math.round((nowMs - ts) / 1000)
            }s 정체)`
          );
          await putSyncItem({
            ...item,
            id: item.id,
            status: 'failed',
            last_error: '[zombie 회복] 이전 세션 중단으로 syncing 정체',
            updated_at: new Date().toISOString(),
          });
        }
      }

      // ── 자가 회복 2: 영구 오류 자동 정리 ──────────────────────────────────
      // payload 결함으로 절대 풀 수 없는 항목 (구버전 큐 등) 은 무한 재시도해도
      // 5회 이상 동일 영구 오류면 큐에서 제거 — 사용자에게 토스트로 알림.
      for (const item of rawQueue) {
        if (item.id === undefined) continue;
        if ((item.retry_count ?? 0) < PERMANENT_ERROR_THRESHOLD) continue;
        if (!isPermanentError(item.last_error)) continue;
        console.error(
          `[FrameOps Sync] 영구 오류 자동 정리 (id=${item.id}, table=${item.table}):`,
          item.last_error
        );
        try {
          await deleteSyncItem(item.id);
          // 사용자 알림 — dead-letter 콜백 재사용 (UI 토스트로 노출됨)
          _deadLetterCallback?.({
            ...item,
            id: item.id,
            retry_count: item.retry_count ?? 0,
            status: 'dead',
            last_error: `[자동 정리] ${item.last_error}`,
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('[FrameOps Sync] 영구 오류 항목 삭제 실패:', e);
        }
      }

      // ── 정상 flush 경로 ───────────────────────────────────────────────────
      // 자가 회복 후 큐를 다시 읽어 'syncing' 외 항목을 FIFO 정렬.
      const queue = await getSyncQueue();
      const pending = queue
        .filter((i) => i.status !== 'syncing')
        .sort((a, b) => {
          if (a.id !== undefined && b.id !== undefined) return a.id - b.id;
          return (a.created_at ?? '').localeCompare(b.created_at ?? '');
        });
      if (!pending.length) return;

      for (const item of pending) {
        if (item.id === undefined) continue;

        // 항목별 try/catch — 단일 항목 처리 중 예외가 나도 다음 항목으로 진행.
        // 또한 'syncing' 으로 마킹 후 예외 발생 시 'failed' 로 즉시 복귀시켜
        // 좀비 잔류를 막는다.
        try {
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
          const justCrossedAlertThreshold = retry_count === ALERT_THRESHOLD;

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
        } catch (e) {
          console.error(
            `[FrameOps Sync] 항목 처리 중 예외 (id=${item.id}) — failed 로 복구:`,
            e
          );
          try {
            await putSyncItem({
              ...item,
              id: item.id,
              status: 'failed',
              last_error: `[crash] ${e instanceof Error ? e.message : String(e)}`,
              updated_at: new Date().toISOString(),
            });
          } catch {
            /* IDB 자체 실패는 다음 주기에서 zombie 회복으로 처리 */
          }
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

  // 재시도도 10초 타임아웃 — 멈춤 방지.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

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
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    clearTimeout(timer);
  }
}
