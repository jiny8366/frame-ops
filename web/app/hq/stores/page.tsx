// Frame Ops Web — HQ: 매장 관리
// 전 매장 리스트 + 추가/편집 + 활성 토글.

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { StoreFormDialog, type StoreRow } from './StoreFormDialog';

const fetcher = async (url: string): Promise<StoreRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StoreRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function HqStoresPage() {
  const { data: stores = [], isLoading, mutate } = useSWR<StoreRow[]>('/api/hq/stores', fetcher);
  const [editing, setEditing] = useState<StoreRow | null>(null);
  const [creating, setCreating] = useState(false);

  const handleAdd = useCallback(() => setCreating(true), []);
  const handleEdit = useCallback((row: StoreRow) => setEditing(row), []);
  const handleClose = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);
  const handleSaved = useCallback(async () => {
    await mutate();
    handleClose();
  }, [mutate, handleClose]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1000px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매장 관리</h1>
          <button
            type="button"
            onClick={handleAdd}
            className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white"
          >
            + 매장 추가
          </button>
        </header>

        <p className="text-caption1 text-[var(--color-label-tertiary)]">
          매장 코드는 직원 로그인의 첫 번째 입력값입니다. 변경 시 해당 매장 직원의 로그인 절차에 영향이 있으니 주의하세요.
        </p>

        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : stores.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              등록된 매장이 없습니다.
            </p>
          ) : (
            <table className="w-full text-callout">
              <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                <tr>
                  <th className="text-left p-3">코드</th>
                  <th className="text-left p-3">매장명</th>
                  <th className="text-left p-3 hidden sm:table-cell">주소</th>
                  <th className="text-left p-3 hidden md:table-cell">전화</th>
                  <th className="text-left p-3 hidden md:table-cell">사업자번호</th>
                  <th className="text-left p-3">상태</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-[var(--color-separator-opaque)]"
                  >
                    <td className="p-3 font-mono text-caption1">{s.store_code}</td>
                    <td className="p-3 font-semibold">{s.name}</td>
                    <td className="p-3 hidden sm:table-cell text-[var(--color-label-secondary)] truncate max-w-[200px]">
                      {s.address ?? '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.phone ?? '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.business_reg_no ?? '—'}
                    </td>
                    <td className="p-3">
                      {s.active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--color-system-green-bg,rgba(52,199,89,0.15))] text-[var(--color-system-green)] text-caption2">
                          활성
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--color-fill-tertiary)] text-[var(--color-label-tertiary)] text-caption2">
                          비활성
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleEdit(s)}
                        className="pressable text-[var(--color-system-blue)] text-caption1"
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <StoreFormDialog
          mode={creating ? 'create' : 'edit'}
          initial={editing}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
