// Frame Ops Web — 미동기화 항목 표시 배지 + 검사 모달
// 우하단 배지: 큐 길이 표시 + 클릭 시 검사 모달 오픈
// 모달: 항목별 last_error, 재시도, 삭제 가능

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { deleteSyncItem, getSyncQueue, type SyncQueueItem } from '@/lib/db/indexeddb';
import { flushSyncQueue, isOnline } from '@/lib/db/sync';

export function PendingSyncBadge() {
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const q = await getSyncQueue();
      setItems(q);
    } catch {
      /* IDB 미지원 */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // 모달 열림 시 자가 회복(zombie 복구 + 영구오류 정리 + 재시도) 즉시 트리거.
  // 사용자가 별도 조작 없이도 진단/복구가 자동 시작되도록 함.
  useEffect(() => {
    if (!open) return;
    if (!isOnline()) return;
    let cancelled = false;
    (async () => {
      try {
        await flushSyncQueue();
        if (!cancelled) await refresh();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refresh]);

  const flushAll = useCallback(async () => {
    if (busy) return;
    if (!isOnline()) {
      toast.info('오프라인 — 네트워크 복구 시 자동 재시도됩니다.', { duration: 3000 });
      return;
    }
    setBusy(true);
    try {
      await flushSyncQueue();
      await refresh();
      const after = await getSyncQueue();
      if (after.length === 0) {
        toast.success('미동기화 항목 모두 동기화 완료');
        setOpen(false);
      } else {
        toast.warning(`${after.length}건 아직 실패 — 자세한 사유는 모달에서 확인`, {
          duration: 4000,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const removeOne = useCallback(
    async (id: number) => {
      if (!confirm('이 항목을 큐에서 영구 삭제합니다. 이 판매는 DB 에 저장되지 않습니다. 계속하시겠습니까?')) {
        return;
      }
      await deleteSyncItem(id);
      await refresh();
      toast.success('큐 항목 삭제');
    },
    [refresh]
  );

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'fixed bottom-4 right-4 z-[60]',
          'rounded-full px-4 py-2.5',
          'bg-[var(--color-system-orange)] text-white',
          'shadow-lg flex items-center gap-2',
          'text-caption1 font-semibold pressable',
        ].join(' ')}
        title="미동기화 판매 — 클릭하여 상세 확인"
        aria-label={`미동기화 ${items.length}건 — 클릭하여 상세 확인`}
      >
        <span aria-hidden>⟳</span>
        <span>미동기화 {items.length}건</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-[640px] max-h-[80vh] flex flex-col rounded-2xl bg-[var(--color-bg-secondary)] overflow-hidden">
            <header className="px-5 py-3 border-b border-[var(--color-separator-opaque)] flex items-center justify-between">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                미동기화 항목 ({items.length})
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="pressable text-callout text-[var(--color-label-secondary)]"
              >
                닫기
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-lg border border-[var(--color-separator-opaque)] p-3 flex flex-col gap-1"
                >
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <span className="text-callout font-semibold">
                      {it.table === 'sales' ? '판매' : it.table}
                    </span>
                    <span className="text-caption2 text-[var(--color-label-tertiary)] tabular-nums">
                      {it.created_at ? new Date(it.created_at).toLocaleString('ko-KR') : '-'}
                    </span>
                  </div>
                  <div className="text-caption1 text-[var(--color-label-secondary)] flex items-baseline gap-2 flex-wrap">
                    <span>상태: {it.status ?? 'pending'}</span>
                    <span>· 재시도 {it.retry_count ?? 0}회</span>
                  </div>
                  {it.last_error && (
                    <div className="text-caption2 text-[var(--color-system-red)] break-all">
                      에러: {it.last_error}
                    </div>
                  )}
                  {/* 판매 페이로드 일부 미리보기 */}
                  {it.table === 'sales' && (
                    <details className="text-caption2 text-[var(--color-label-tertiary)]">
                      <summary className="cursor-pointer">payload 미리보기</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] bg-[var(--color-fill-quaternary)] p-2 rounded">
                        {JSON.stringify(it.payload, null, 2).slice(0, 500)}
                      </pre>
                    </details>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => it.id !== undefined && removeOne(it.id)}
                      className="pressable text-caption2 text-[var(--color-system-red)]"
                    >
                      삭제 (저장 포기)
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <footer className="px-5 py-3 border-t border-[var(--color-separator-opaque)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={flushAll}
                disabled={busy}
                className="pressable touch-target rounded-xl px-4 py-2 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
              >
                {busy ? '진단/재시도 중…' : '자동 진단 + 즉시 재시도'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
