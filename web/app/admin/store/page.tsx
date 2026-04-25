// Frame Ops Web — 매장 정보
// 현재 세션 매장의 정보를 표시·수정. store_code 는 변경 불가 (로그인 키).

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';

interface StoreData {
  id: string;
  store_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_reg_no: string | null;
  active: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StoreData | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data;
};

export default function StoreAdminPage() {
  const { data, isLoading, mutate } = useSWR<StoreData | null>('/api/admin/store', fetcher);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [bizNo, setBizNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name ?? '');
      setAddress(data.address ?? '');
      setPhone(data.phone ?? '');
      setBizNo(data.business_reg_no ?? '');
    }
  }, [data]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setMessage(null);

      try {
        const res = await fetch('/api/admin/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            address: address || null,
            phone: phone || null,
            business_reg_no: bizNo || null,
          }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          setMessage({ type: 'err', text: json.error ?? '저장 실패' });
        } else {
          setMessage({ type: 'ok', text: '저장 완료' });
          await mutate();
        }
      } catch (err) {
        setMessage({ type: 'err', text: err instanceof Error ? err.message : '네트워크 오류' });
      } finally {
        setSubmitting(false);
      }
    },
    [name, address, phone, bizNo, submitting, mutate]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[600px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매장 정보</h1>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            매장 정보를 불러올 수 없습니다.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl bg-[var(--color-bg-secondary)] p-5"
          >
            <Field label="지점 코드 (로그인 키)">
              <input
                type="text"
                value={data.store_code}
                disabled
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-fill-quaternary)] px-3 py-2 text-callout font-mono opacity-70"
              />
              <span className="text-caption2 text-[var(--color-label-tertiary)]">
                변경 불가 — 로그인에 사용됩니다.
              </span>
            </Field>

            <Field label="매장명">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            <Field label="주소">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="전화번호">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                />
              </Field>
              <Field label="사업자등록번호">
                <input
                  type="text"
                  value={bizNo}
                  onChange={(e) => setBizNo(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                />
              </Field>
            </div>

            {message && (
              <p
                className={`text-caption1 text-center ${
                  message.type === 'ok'
                    ? 'text-[var(--color-system-green)]'
                    : 'text-[var(--color-system-red)]'
                }`}
              >
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
            >
              {submitting ? '저장 중…' : '저장'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-callout text-[var(--color-label-secondary)]">{label}</span>
      {children}
    </label>
  );
}
