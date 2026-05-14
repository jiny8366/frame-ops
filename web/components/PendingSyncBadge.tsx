// Frame Ops Web — 미동기화 항목 표시 배지 + 검사 모달
// 우하단 배지: 큐 길이 표시 + 클릭 시 검사 모달 오픈
// 모달: 항목별 last_error, 다음 재시도 ETA, 수동 재시도 버튼
//
// 정책 (강화):
//   - 영구 dead-letter 폐기. 자동 재시도가 항상 진행 중.
//   - 사용자 임의 삭제는 영구 손실 위험이 있어 기본 노출하지 않음.
//     ('invalid' 상태인 영구 오류만 별도 영역에서 진단 후 처리 가능)
//   - 미동기화 사례 자동 처리 요구 반영 — 사용자 액션 최소화

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSyncQueue, type SyncQueueItem } from '@/lib/db/indexeddb';
import { discardDeadLetter, flushSyncQueue, isOnline, nextRetryEtaSeconds } from '@/lib/db/sync';

export function PendingSyncBadge() {
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

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
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  // ETA 카운트다운 — 모달 열려있을 때만 1초 갱신
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

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
        toast.warning(`${after.length}건 아직 실패 — 자동 재시도 중`, { duration: 4000 });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  // 영구 오류 ('invalid') — 진단 후 폐기 (관리자 의도적 액션).
  // 일반 'pending'/'failed' 는 자동 재시도 — 사용자 폐기 옵션 노출하지 않음.
  const discardInvalid = useCallback(
    async (id: number) => {
      if (
        !confirm(
          '이 항목은 서버가 영구 오류로 응답했습니다 (스키마/검증 실패 등). 영구 삭제하시겠습니까?\n\n주의: 이 판매는 DB 에 저장되지 않으며 복구할 수 없습니다.'
        )
      ) {
        return;
      }
      await discardDeadLetter(id);
      await refresh();
      toast.success('영구 오류 항목 삭제');
    },
    [refresh]
  );

  if (items.length === 0) return null;

  const invalidCount = items.filter((i) => i.status === 'invalid').length;
  const autoRetryCount = items.length - invalidCount;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'fixed bottom-4 right-4 z-[60]',
          'rounded-full px-4 py-2.5',
          invalidCount > 0
            ? 'bg-[var(--color-system-red)]'
            : 'bg-[var(--color-system-orange)]',
          'text-white shadow-lg flex items-center gap-2',
          'text-caption1 font-semibold pressable',
        ].join(' ')}
        title="미동기화 판매 — 클릭하여 상세 확인"
        aria-label={`미동기화 ${items.length}건 — 클릭하여 상세 확인`}
      >
        <span aria-hidden>⟳</span>
        <span>
          {invalidCount > 0
            ? `오류 ${invalidCount}건 · 대기 ${autoRetryCount}건`
            : `자동 재시도 ${autoRetryCount}건`}
        </span>
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

            <div className="px-5 py-2 bg-[var(--color-fill-quaternary)] text-caption2 text-[var(--color-label-secondary)]">
              자동 재시도가 진행 중입니다. 네트워크/세션 복구 시 5~30초 내 등록됩니다.
              {invalidCount > 0 && (
                <span className="block mt-1 text-[var(--color-system-red)] font-semibold">
                  ⚠ 영구 오류 {invalidCount}건 — 서버가 검증 실패로 응답. 진단 필요.
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {items.map((it) => {
                const eta = nextRetryEtaSeconds(it);
                const isInvalid = it.status === 'invalid';
                // tick 으로 ETA 재계산 트리거 (useState 의존성)
                void tick;
                return (
                  <div
                    key={it.id}
                    className={[
                      'rounded-lg border p-3 flex flex-col gap-1',
                      isInvalid
                        ? 'border-[var(--color-system-red)] bg-[var(--color-system-red)]/5'
                        : 'border-[var(--color-separator-opaque)]',
                    ].join(' ')}
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
                      <span>
                        상태:{' '}
                        {isInvalid
                          ? '영구 오류'
                          : (it.status ?? 'pending') === 'syncing'
                            ? '전송 중'
                            : '자동 재시도 대기'}
                      </span>
                      <span>· 재시도 {it.retry_count ?? 0}회</span>
                      {!isInvalid && eta > 0 && (
                        <span className="text-[var(--color-system-blue)]">
                          · 다음 재시도 {eta}초 후
                        </span>
                      )}
                      {!isInvalid && eta === 0 && (
                        <span className="text-[var(--color-system-green)]">· 곧 재시도</span>
                      )}
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
                    {/* 영구 오류만 사용자 폐기 노출 — 일반 항목은 자동 회수에 위임 */}
                    {isInvalid && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => it.id !== undefined && discardInvalid(it.id)}
                          className="pressable text-caption2 text-[var(--color-system-red)]"
                        >
                          영구 삭제 (복구 불가)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <footer className="px-5 py-3 border-t border-[var(--color-separator-opaque)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={flushAll}
                disabled={busy}
                className="pressable touch-target rounded-xl px-4 py-2 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
              >
                {busy ? '재시도 중…' : '전체 즉시 재시도'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
