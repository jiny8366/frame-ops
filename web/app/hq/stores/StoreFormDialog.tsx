// Frame Ops Web — HQ 매장 등록/편집 모달

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

export interface StoreRow {
  id: string;
  store_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_reg_no: string | null;
  active: boolean;
  created_at?: string;
}

interface Props {
  mode: 'create' | 'edit';
  initial: StoreRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StoreFormDialog({ mode, initial, onClose, onSaved }: Props) {
  const [storeCode, setStoreCode] = useState(initial?.store_code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [bizNo, setBizNo] = useState(initial?.business_reg_no ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          const res = await fetch('/api/hq/stores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_code: storeCode.trim().toUpperCase(),
              name: name.trim(),
              address: address || null,
              phone: phone || null,
              business_reg_no: bizNo || null,
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
          toast.success('매장 추가 완료');
        } else if (initial) {
          const res = await fetch(`/api/hq/stores/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_code: storeCode.trim().toUpperCase(),
              name: name.trim(),
              address: address || null,
              phone: phone || null,
              business_reg_no: bizNo || null,
              active,
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
          toast.success('매장 정보 갱신');
        }
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [mode, initial, storeCode, name, address, phone, bizNo, active, submitting, onSaved]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[480px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8"
      >
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
          {mode === 'create' ? '매장 추가' : '매장 편집'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="매장 코드 (로그인 키)">
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              required
              autoCapitalize="characters"
              placeholder="예: BKC02"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
            />
          </Field>
          <Field label="매장명">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        <Field label="주소">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="전화">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
          <Field label="사업자등록번호">
            <input
              type="text"
              value={bizNo}
              onChange={(e) => setBizNo(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

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
            disabled={submitting || !storeCode.trim() || !name.trim()}
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
