// Frame Ops Web — 매입처 관리
// 매입처 등록/수정 + 취급 브랜드 매핑 (fo_supplier_brands).

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { SupplierFormDialog, type SupplierRow } from './SupplierFormDialog';

const fetcher = async (url: string): Promise<SupplierRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: SupplierRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function SuppliersAdminPage() {
  const { data: suppliers = [], isLoading, mutate } = useSWR<SupplierRow[]>(
    '/api/admin/suppliers?include_inactive=1',
    fetcher
  );
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [creating, setCreating] = useState(false);

  const handleAdd = useCallback(() => setCreating(true), []);
  const handleEdit = useCallback((row: SupplierRow) => setEditing(row), []);
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
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매입처 관리</h1>
          <button
            type="button"
            onClick={handleAdd}
            className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white"
          >
            + 매입처 추가
          </button>
        </header>

        <p className="text-caption1 text-[var(--color-label-tertiary)]">
          취급 브랜드 매핑은 매입처 편집에서 설정합니다. 매핑된 브랜드의 제품만 주문리스트에 표시됩니다.
        </p>

        {/* 리스트 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : suppliers.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              등록된 매입처가 없습니다.
            </p>
          ) : (
            <table className="w-full text-callout">
              <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                <tr>
                  <th className="text-left p-3">매입처명</th>
                  <th className="text-left p-3 hidden sm:table-cell">코드</th>
                  <th className="text-left p-3 hidden md:table-cell">담당자</th>
                  <th className="text-left p-3 hidden md:table-cell">사업자번호</th>
                  <th className="text-left p-3">상태</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-[var(--color-separator-opaque)]"
                  >
                    <td className="p-3 font-semibold">{s.name}</td>
                    <td className="p-3 hidden sm:table-cell font-mono text-caption1">
                      {s.supplier_code ?? '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.contact ?? '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.business_number ?? '—'}
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
        <SupplierFormDialog
          mode={creating ? 'create' : 'edit'}
          initial={editing}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
