// Frame Ops Web — 계정설정 (본사)
// 모든 매장의 계정 리스트 + 매장 필터 + 추가/편집.
// StaffFormDialog 를 apiBase=/api/hq/staff 로 재사용.

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { StaffFormDialog } from '@/app/admin/staff/StaffFormDialog';

// 본사 화면에서 생성/수정 가능한 역할 — 판매사/직원은 지점에서 등록.
const HQ_ASSIGNABLE_ROLES: readonly string[] = [
  'hq_super',
  'hq_purchase',
  'hq_view',
  'store_manager',
];

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
  active: boolean;
}

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
  store_id: string | null;
  store_code: string | null;
  store_name: string | null;
  password_plain?: string | null;
}

interface ApiResponse {
  staff: StaffRow[];
  stores: StoreOpt[];
}

const fetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: ApiResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

export default function HqStaffPage() {
  const [storeId, setStoreId] = useState<string>('');
  const url = `/api/hq/staff${storeId ? `?store_id=${storeId}` : ''}`;
  const { data, isLoading, mutate } = useSWR<ApiResponse>(url, fetcher);

  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);

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

  const staff = data?.staff ?? [];
  const stores = data?.stores ?? [];

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            계정설정
          </h1>
          <button
            type="button"
            onClick={handleAdd}
            className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white"
          >
            + 계정 추가
          </button>
        </header>

        {/* 매장 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4">
          <label className="flex items-center gap-2">
            <span className="text-caption1 text-[var(--color-label-secondary)]">매장</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체 매장</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.store_code})
                </option>
              ))}
            </select>
            <span className="text-caption2 text-[var(--color-label-tertiary)] ml-2">
              총 {staff.length}명
            </span>
          </label>
        </div>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : staff.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            조건에 맞는 직원이 없습니다.
          </p>
        ) : (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                  <tr>
                    <th className="text-left p-3">로그인 ID</th>
                    <th className="text-left p-3">이름</th>
                    <th className="text-left p-3 hidden sm:table-cell">매장</th>
                    <th className="text-left p-3 hidden md:table-cell">역할</th>
                    <th className="text-left p-3 hidden lg:table-cell">직급</th>
                    <th className="text-left p-3">상태</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.user_id} className="border-t border-[var(--color-separator-opaque)]">
                      <td className="p-3 font-mono">{s.login_id ?? '—'}</td>
                      <td className="p-3">{s.display_name ?? '—'}</td>
                      <td className="p-3 hidden sm:table-cell">
                        {s.store_name ? (
                          <div>
                            <div>{s.store_name}</div>
                            <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                              {s.store_code}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell text-[var(--color-label-secondary)]">
                        {s.role_code}
                      </td>
                      <td className="p-3 hidden lg:table-cell text-[var(--color-label-secondary)]">
                        {s.job_title_code ?? '—'}
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
          </div>
        )}
      </div>

      {(creating || editing) && (
        <StaffFormDialog
          mode={creating ? 'create' : 'edit'}
          initial={editing}
          onClose={handleClose}
          onSaved={handleSaved}
          apiBase="/api/hq/staff"
          allowedRoles={HQ_ASSIGNABLE_ROLES}
        />
      )}
    </main>
  );
}
