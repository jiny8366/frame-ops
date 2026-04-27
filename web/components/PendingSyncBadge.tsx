// Frame Ops Web — 미동기화 항목 표시 배지
// sync_queue 에 미처리 판매가 있으면 우하단에 카운트를 띄워 사용자가 인지할 수 있도록.
// 클릭 시 즉시 재시도(flushSyncQueue) 호출.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSyncQueue } from '@/lib/db/indexeddb';
import { flushSyncQueue, isOnline } from '@/lib/db/sync';

export function PendingSyncBadge() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  // 5초마다 큐 길이 폴링
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const q = await getSyncQueue();
        if (!cancelled) setCount(q.length);
      } catch {
        /* IDB 미지원 등 */
      }
    };
    refresh();
    const id = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleRetry = useCallback(async () => {
    if (busy) return;
    if (!isOnline()) {
      toast.info('오프라인 — 네트워크 복구 시 자동 재시도됩니다.', { duration: 3000 });
      return;
    }
    setBusy(true);
    try {
      await flushSyncQueue();
      const after = await getSyncQueue();
      setCount(after.length);
      if (after.length === 0) {
        toast.success('미동기화 항목 모두 동기화 완료');
      } else {
        toast.warning(`${after.length}건 아직 동기화 실패 — 계속 자동 재시도`, { duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={busy}
      className={[
        'fixed bottom-4 right-4 z-[60]',
        'rounded-full px-4 py-2.5',
        'bg-[var(--color-system-orange)] text-white',
        'shadow-lg flex items-center gap-2',
        'text-caption1 font-semibold',
        'pressable disabled:opacity-60',
      ].join(' ')}
      title="미동기화 판매 — 클릭하여 즉시 재시도"
      aria-label={`미동기화 ${count}건 재시도`}
    >
      <span aria-hidden>⟳</span>
      <span>미동기화 {count}건</span>
      {busy && <span className="text-caption2 opacity-80">처리 중…</span>}
    </button>
  );
}
