// Frame Ops Web — 직원 추가/편집 모달

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';

interface StaffRow {
  user_id: string;
  login_id: string | null;
  display_name: string | null;
  role_code: string;
  job_title_code: string | null;
  phone: string | null;
  active: boolean;
}

interface RolesResponse {
  roles: Array<{ code: string; label: string; sort_order: number }>;
  job_titles: Array<{ code: string; label: string; sort_order: number }>;
}

interface StaffFormDialogProps {
  mode: 'create' | 'edit';
  initial: StaffRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: RolesResponse | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data!;
};

export function StaffFormDialog({ mode, initial, onClose, onSaved }: StaffFormDialogProps) {
  const { data: opts } = useSWR<RolesResponse>('/api/admin/staff/roles', fetcher);

  const [loginId, setLoginId] = useState(initial?.login_id ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [roleCode, setRoleCode] = useState(initial?.role_code ?? 'store_staff');
  const [jobTitleCode, setJobTitleCode] = useState(initial?.job_title_code ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      try {
        if (mode === 'create') {
          const res = await fetch('/api/admin/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              login_id: loginId.trim(),
              display_name: displayName.trim(),
              role_code: roleCode,
              job_title_code: jobTitleCode || null,
              phone: phone || null,
              password,
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
          };
          if (password) update.password = password;

          const res = await fetch(`/api/admin/staff/${initial.user_id}`, {
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
    [mode, initial, loginId, displayName, roleCode, jobTitleCode, phone, active, password, submitting, onSaved]
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
        className="w-full max-w-[440px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5"
      >
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
          {mode === 'create' ? '직원 추가' : '직원 편집'}
        </h2>

        <Field label="로그인 ID">
          <input
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            disabled={mode === 'edit'}
            required
            autoCapitalize="none"
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout disabled:opacity-50"
          />
        </Field>

        <Field label="이름">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="역할">
            <select
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
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
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">선택 없음</option>
              {(opts?.job_titles ?? []).map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="전화">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <Field
          label={
            mode === 'create' ? '비밀번호' : '비밀번호 (변경 시에만 입력)'
          }
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={mode === 'create'}
            autoComplete="new-password"
            placeholder={mode === 'edit' ? '비워두면 변경 안 함' : ''}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
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

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
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
