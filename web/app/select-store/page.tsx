// Frame Ops Web — 매장 선택
// 본사 사용자가 다중 매장에 접근 가능할 때 작업할 매장을 선택하는 페이지.

'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';

interface AccessibleStore {
  id: string;
  store_code: string;
  name: string;
}

interface AccessibleResponse {
  stores: AccessibleStore[];
  current_store_id: string;
}

const fetcher = async (url: string): Promise<AccessibleResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: AccessibleResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

export default function SelectStorePage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/hq';

  const { data, isLoading } = useSWR<AccessibleResponse>(
    '/api/auth/accessible-stores',
    fetcher
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePick = useCallback(
    async (storeId: string) => {
      if (busyId) return;
      setBusyId(storeId);
      setError(null);
      try {
        const res = await fetch('/api/auth/switch-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          setError(json.error ?? '전환 실패');
          setBusyId(null);
          return;
        }
        await globalMutate('/api/auth/me');
        router.replace(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setBusyId(null);
      }
    },
    [busyId, next, router]
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] safe-padding p-4">
      <div className="w-full max-w-[640px] flex flex-col gap-4 rounded-2xl bg-[var(--color-bg-secondary)] p-6">
        <header className="flex flex-col items-center gap-1 text-center">
          <span className="text-largeTitle">🏬</span>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            매장 선택
          </h1>
          <p className="text-caption1 text-[var(--color-label-secondary)]">
            작업할 매장을 선택하세요. 이후 헤더 우상단에서 변경 가능합니다.
          </p>
        </header>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
            불러오는 중…
          </p>
        ) : !data || data.stores.length === 0 ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-8">
            접근 가능한 매장이 없습니다. 관리자에게 문의하세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.stores.map((s) => {
              const isCurrent = s.id === data.current_store_id;
              const isBusy = busyId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handlePick(s.id)}
                  disabled={!!busyId}
                  className={`pressable touch-target-lg flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-colors ${
                    isCurrent
                      ? 'border-[var(--color-system-blue)] bg-[var(--color-system-blue)]/10'
                      : 'border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] hover:border-[var(--color-system-blue)]'
                  } disabled:opacity-50`}
                >
                  <span className="text-caption2 font-mono text-[var(--color-label-tertiary)]">
                    {s.store_code}
                  </span>
                  <span className="text-headline font-semibold text-[var(--color-label-primary)]">
                    {s.name}
                  </span>
                  {isCurrent && (
                    <span className="text-caption2 text-[var(--color-system-blue)]">현재</span>
                  )}
                  {isBusy && (
                    <span className="text-caption2 text-[var(--color-label-secondary)]">
                      전환 중…
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center">{error}</p>
        )}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => router.replace('/hq')}
            className="text-caption1 text-[var(--color-label-tertiary)] underline"
          >
            본사 대시보드로 가기 (매장 선택 보류)
          </button>
        </div>
      </div>
    </main>
  );
}
