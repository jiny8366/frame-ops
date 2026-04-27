// Frame Ops Web — 계정설정
// 현재 매장 소속 계정 리스트 + 추가/편집 모달.

'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { StaffFormDialog } from './StaffFormDialog';
import { useSession } from '@/hooks/useSession';

const STORE_MANAGER_ASSIGNABLE: readonly string[] = ['store_salesperson', 'store_staff'];

interface StaffRow {
  user_id: string;
  login_id: string | null;
  display_name: string | null;
  role_code: string;
  job_title_code: string | null;
  phone: string | null;
  active: boolean;
  password_updated_at: string | null;
  created_at: string;
  permissions?: string[] | null;
  store_id?: string | null;
}

const fetcher = async (url: string): Promise<StaffRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StaffRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function StaffAdminPage() {
  const { session } = useSession();
  const { data: staff, isLoading, mutate } = useSWR<StaffRow[]>('/api/admin/staff', fetcher);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);

  // 본사(hq_*) 라면 모든 역할 허용 + store 자유 선택. 지점 매니저는 판매사/직원만 + 매장 잠금.
  const callerIsManager = session?.role_code === 'store_manager';
  const allowedRoles = useMemo<readonly string[] | undefined>(() => {
    if (callerIsManager) return STORE_MANAGER_ASSIGNABLE;
    return undefined; // HQ — 전체
  }, [callerIsManager]);
  const lockedStoreId = callerIsManager ? session?.store_id ?? null : null;

  const handleAdd = useCallback(() => setCreating(true), []);
  const handleEdit = useCallback((row: StaffRow) => setEditing(row), []);
  const handleClose = useCallback(() => {
    setEditing(null);
    setCreating(false);
  }, []);
  const handleSaved = useCallback(async () => {
    await mutate();
    handleClose();
  }, [mutate, handleClose]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[900px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">계정설정</h1>
          <button
            type="button"
            onClick={handleAdd}
            className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white"
          >
            + 계정 추가
          </button>
        </header>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !staff || staff.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            등록된 계정이 없습니다. 우상단 “계정 추가” 버튼으로 추가하세요.
          </p>
        ) : (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
            <table className="w-full text-callout">
              <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                <tr>
                  <th className="text-left p-3">로그인 ID</th>
                  <th className="text-left p-3">이름</th>
                  <th className="text-left p-3 hidden sm:table-cell">역할</th>
                  <th className="text-left p-3 hidden md:table-cell">직급</th>
                  <th className="text-left p-3 hidden md:table-cell">전화</th>
                  <th className="text-left p-3">상태</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr
                    key={s.user_id}
                    className="border-t border-[var(--color-separator-opaque)]"
                  >
                    <td className="p-3 font-mono text-[var(--color-label-primary)]">
                      {s.login_id ?? '—'}
                    </td>
                    <td className="p-3">{s.display_name ?? '—'}</td>
                    <td className="p-3 hidden sm:table-cell text-[var(--color-label-secondary)]">
                      {s.role_code}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.job_title_code ?? '—'}
                    </td>
                    <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                      {s.phone ?? '—'}
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
                        className="pressable text-[var(--color-system-blue)] text-callout"
                      >
                        편집
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <StaffFormDialog
          mode={creating ? 'create' : 'edit'}
          initial={editing}
          onClose={handleClose}
          onSaved={handleSaved}
          allowedRoles={allowedRoles}
          lockedStoreId={lockedStoreId}
        />
      )}
    </main>
  );
}
