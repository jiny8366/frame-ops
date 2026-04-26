// Frame Ops Web — 계정 추가/편집 모달
// role 선택 + 메뉴별 접근권한 (체크박스 그리드) + 지점 역할 시 근무지 선택.

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import {
  ALL_PERMISSIONS,
  ROLE_DEFAULTS,
  effectivePermissions,
  type PermissionDef,
} from '@/lib/auth/permissions';
import { useSession } from '@/hooks/useSession';

interface StaffRow {
  user_id: string;
  login_id: string | null;
  display_name: string | null;
  role_code: string;
  job_title_code: string | null;
  phone: string | null;
  active: boolean;
  permissions?: string[] | null;
  store_id?: string | null;
  /** 본사 관리자만 응답에 포함됨. 지점 계정에서만 사용 */
  password_plain?: string | null;
}

interface RolesResponse {
  roles: Array<{ code: string; label: string; sort_order: number }>;
  job_titles: Array<{ code: string; label: string; sort_order: number; scope?: 'hq' | 'store' | 'both' }>;
}

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
  active: boolean;
}

interface StaffFormDialogProps {
  mode: 'create' | 'edit';
  initial: StaffRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** 호출할 API 베이스. 기본 /api/admin/staff. HQ 페이지에서는 /api/hq/staff 사용. */
  apiBase?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: RolesResponse | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data!;
};

const storesFetcher = async (url: string): Promise<StoreOpt[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StoreOpt[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export function StaffFormDialog({ mode, initial, onClose, onSaved, apiBase = '/api/admin/staff' }: StaffFormDialogProps) {
  const { session } = useSession();
  const callerIsHq = !!session && session.role_code.startsWith('hq_');

  const { data: opts } = useSWR<RolesResponse>('/api/admin/staff/roles', fetcher);
  const { data: stores } = useSWR<StoreOpt[]>('/api/hq/stores', storesFetcher);

  const [loginId, setLoginId] = useState(initial?.login_id ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [roleCode, setRoleCode] = useState(initial?.role_code ?? 'store_staff');
  const [jobTitleCode, setJobTitleCode] = useState(initial?.job_title_code ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState<string>(initial?.store_id ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStoreRole = roleCode.startsWith('store_');
  const activeStores = useMemo(
    () => (stores ?? []).filter((s) => s.active),
    [stores]
  );

  // 역할 scope 에 맞는 직급만 노출 (지점 역할 → store, 본사 역할 → hq, 그 외 → both 포함)
  const visibleJobTitles = useMemo(() => {
    const all = opts?.job_titles ?? [];
    const target: 'hq' | 'store' = isStoreRole ? 'store' : 'hq';
    return all.filter((t) => !t.scope || t.scope === target || t.scope === 'both');
  }, [opts?.job_titles, isStoreRole]);

  // 역할 변경 시 현재 직급이 새 scope 에 없으면 초기화
  useEffect(() => {
    if (!jobTitleCode) return;
    if (!visibleJobTitles.some((t) => t.code === jobTitleCode)) {
      setJobTitleCode('');
    }
  }, [visibleJobTitles, jobTitleCode]);

  // 권한 — 명시 override 사용 여부 + 체크된 권한 키 집합
  const [useCustomPerms, setUseCustomPerms] = useState<boolean>(
    Array.isArray(initial?.permissions) && initial!.permissions!.length > 0
  );
  const [perms, setPerms] = useState<Set<string>>(
    () => new Set(initial?.permissions ?? effectivePermissions(initial?.role_code ?? 'store_staff', null))
  );

  // role 변경 시 — custom override 가 OFF 면 권한도 role 기본값으로 동기화
  useEffect(() => {
    if (!useCustomPerms) {
      setPerms(new Set(ROLE_DEFAULTS[roleCode] ?? []));
    }
  }, [roleCode, useCustomPerms]);

  const togglePerm = useCallback((key: string) => {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 권한 그룹별 정렬
  const groupedPerms = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of ALL_PERMISSIONS) {
      const arr = map.get(p.group) ?? [];
      arr.push(p);
      map.set(p.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  // ESC 닫기
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, submitting]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      const permissionsPayload = useCustomPerms ? Array.from(perms) : null;
      const storeIdPayload = isStoreRole && storeId ? storeId : null;

      if (isStoreRole && !storeIdPayload) {
        setError('지점 역할은 근무지를 선택해야 합니다.');
        setSubmitting(false);
        return;
      }

      try {
        if (mode === 'create') {
          const res = await fetch(apiBase, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              login_id: loginId.trim(),
              display_name: displayName.trim(),
              role_code: roleCode,
              job_title_code: jobTitleCode || null,
              phone: phone || null,
              password,
              permissions: permissionsPayload,
              store_id: storeIdPayload,
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
        } else if (initial) {
          const update: Record<string, unknown> = {
            display_name: displayName.trim(),
            role_code: roleCode,
            job_title_code: jobTitleCode || null,
            phone: phone || null,
            active,
            permissions: permissionsPayload,
            store_id: storeIdPayload,
          };
          if (password) update.password = password;

          const res = await fetch(`${apiBase}/${initial.user_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(update),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
        }
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [mode, initial, loginId, displayName, roleCode, jobTitleCode, phone, active, password, useCustomPerms, perms, isStoreRole, storeId, submitting, onSaved, apiBase]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[1080px] max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-[var(--color-bg-secondary)] overflow-hidden"
      >
        {/* 헤더 */}
        <header className="px-5 py-3 border-b border-[var(--color-separator-opaque)]">
          <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
            {mode === 'create' ? '계정 추가' : '계정 편집'}
          </h2>
        </header>

        {/* 본문: 2-column (기본 정보 좌측 / 권한 우측) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5">
          {/* ── 좌측: 기본 정보 ─────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <Field label="로그인 ID">
              <input
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={mode === 'edit'}
                required
                autoCapitalize="none"
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout disabled:opacity-50"
              />
            </Field>

            <Field label="이름">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            <Field label="역할">
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              >
                {(opts?.roles ?? []).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="직급">
              <select
                value={jobTitleCode}
                onChange={(e) => setJobTitleCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              >
                <option value="">선택 없음</option>
                {visibleJobTitles.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="전화">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            {mode === 'edit' && callerIsHq && isStoreRole && initial?.password_plain && (
              <Field label="현재 비밀번호 (본사 관리자 전용)">
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={initial.password_plain}
                    readOnly
                    className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-fill-quaternary)] px-3 py-2 text-callout font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="pressable rounded-lg px-3 py-2 bg-[var(--color-fill-secondary)] text-caption1 font-medium"
                  >
                    {showPassword ? '숨기기' : '보기'}
                  </button>
                </div>
              </Field>
            )}

            <Field label={mode === 'create' ? '비밀번호' : '비밀번호 (변경 시에만 입력)'}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode === 'create'}
                autoComplete="new-password"
                placeholder={mode === 'edit' ? '비워두면 변경 안 함' : ''}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            {mode === 'edit' && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <span className="text-callout">활성 상태 (체크 해제 시 로그인 차단)</span>
              </label>
            )}

            {isStoreRole && (
              <Field label="근무지">
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                >
                  <option value="">매장 선택</option>
                  {activeStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.store_code})
                    </option>
                  ))}
                </select>
                <span className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
                  지점 역할은 한 매장에 소속됩니다.
                </span>
              </Field>
            )}
          </div>

          {/* ── 우측: 메뉴별 접근 권한 ───────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useCustomPerms}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setUseCustomPerms(next);
                    if (!next) setPerms(new Set(ROLE_DEFAULTS[roleCode] ?? []));
                  }}
                />
                <span className="text-callout font-semibold">메뉴별 접근 권한 직접 지정</span>
              </label>
              <span className="text-caption2 text-[var(--color-label-tertiary)]">
                {useCustomPerms ? `${perms.size} / ${ALL_PERMISSIONS.length} 활성` : 'role 기본값 사용'}
              </span>
            </div>
            <p className="text-caption2 text-[var(--color-label-tertiary)]">
              체크 해제 시 역할(role)의 기본 권한을 사용. 직접 지정하면 아래 체크박스가 우선합니다.
            </p>
            <div
              className={`rounded-lg border border-[var(--color-separator-opaque)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-2 ${
                useCustomPerms ? '' : 'opacity-50 pointer-events-none'
              }`}
            >
              {groupedPerms.map(([group, list]) => (
                <details key={group} open className="rounded-md bg-[var(--color-fill-quaternary)] p-2">
                  <summary className="cursor-pointer text-caption1 font-semibold text-[var(--color-label-primary)]">
                    {group} ({list.filter((p) => perms.has(p.key)).length}/{list.length})
                  </summary>
                  <div className="grid grid-cols-1 gap-0.5 mt-2">
                    {list.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--color-fill-tertiary)] text-caption1"
                      >
                        <input
                          type="checkbox"
                          checked={perms.has(p.key)}
                          onChange={() => togglePerm(p.key)}
                          disabled={!useCustomPerms}
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* 푸터: 에러 + 액션 */}
        <footer className="px-5 py-3 border-t border-[var(--color-separator-opaque)] flex items-center justify-between gap-3">
          <p
            className={`text-caption1 ${error ? 'text-[var(--color-system-red)]' : 'invisible'}`}
          >
            {error || '\u00a0'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="pressable touch-target rounded-xl px-4 py-2 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="pressable touch-target rounded-xl px-5 py-2 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
            >
              {submitting ? '저장 중…' : '저장'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption1 text-[var(--color-label-secondary)]">{label}</span>
      {children}
    </label>
  );
}
