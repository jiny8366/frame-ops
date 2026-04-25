// Frame Ops Web — 매입처 등록/수정 모달 + 브랜드 매핑

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';

export interface SupplierRow {
  id: string;
  name: string;
  supplier_code: string | null;
  contact: string | null;
  business_number: string | null;
  address: string | null;
  memo: string | null;
  active: boolean;
}

interface BrandRow {
  id: string;
  name: string;
}

interface Props {
  mode: 'create' | 'edit';
  initial: SupplierRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const arrayFetcher = async <T,>(url: string): Promise<T[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: T[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export function SupplierFormDialog({ mode, initial, onClose, onSaved }: Props) {
  const { data: brands = [] } = useSWR<BrandRow[]>('/api/admin/brands', arrayFetcher);
  const { data: linkedBrandIds = [], mutate: mutateLinks } = useSWR<string[]>(
    mode === 'edit' && initial ? `/api/admin/suppliers/${initial.id}/brands` : null,
    arrayFetcher
  );

  const [name, setName] = useState(initial?.name ?? '');
  const [supplierCode, setSupplierCode] = useState(initial?.supplier_code ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [bizNo, setBizNo] = useState(initial?.business_number ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 편집 진입 시 매핑 로드
  useEffect(() => {
    if (mode === 'edit' && linkedBrandIds.length > 0) {
      setSelectedBrands(new Set(linkedBrandIds));
    }
  }, [mode, linkedBrandIds]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, submitting]);

  const toggleBrand = useCallback((brandId: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      try {
        let supplierId = initial?.id ?? '';

        if (mode === 'create') {
          const res = await fetch('/api/admin/suppliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              supplier_code: supplierCode || null,
              contact: contact || null,
              business_number: bizNo || null,
              address: address || null,
              memo: memo || null,
            }),
          });
          const json = (await res.json()) as {
            data: { id: string } | null;
            error: string | null;
          };
          if (!res.ok || json.error || !json.data) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
          supplierId = json.data.id;
        } else if (initial) {
          const res = await fetch(`/api/admin/suppliers/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              supplier_code: supplierCode || null,
              contact: contact || null,
              business_number: bizNo || null,
              address: address || null,
              memo: memo || null,
              active,
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
        }

        // 브랜드 매핑 저장
        if (supplierId) {
          const res = await fetch(`/api/admin/suppliers/${supplierId}/brands`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand_ids: Array.from(selectedBrands) }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            toast.error(`매입처는 저장됐으나 브랜드 매핑 실패: ${json.error}`);
          } else {
            await mutateLinks();
          }
        }

        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [mode, initial, name, supplierCode, contact, bizNo, address, memo, active, selectedBrands, submitting, mutateLinks, onSaved]
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
        className="w-full max-w-[560px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8"
      >
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
          {mode === 'create' ? '매입처 추가' : '매입처 편집'}
        </h2>

        <Field label="매입처명">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="매입처 코드">
            <input
              type="text"
              value={supplierCode}
              onChange={(e) => setSupplierCode(e.target.value)}
              autoCapitalize="characters"
              placeholder="예: SUP01"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
            />
          </Field>
          <Field label="사업자등록번호">
            <input
              type="text"
              value={bizNo}
              onChange={(e) => setBizNo(e.target.value)}
              inputMode="numeric"
              placeholder="000-00-00000"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        <Field label="담당자 / 연락처">
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <Field label="주소">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <Field label="메모">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        {/* 취급 브랜드 매핑 */}
        <Field label={`취급 브랜드 (${selectedBrands.size}개 선택)`}>
          {brands.length === 0 ? (
            <p className="text-caption1 text-[var(--color-label-tertiary)]">
              등록된 브랜드가 없습니다. 상품 등록 화면에서 먼저 추가하세요.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-[160px] overflow-auto rounded-lg border border-[var(--color-separator-opaque)] p-2 bg-[var(--color-bg-primary)]">
              {brands.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-[var(--color-fill-quaternary)] text-caption1"
                >
                  <input
                    type="checkbox"
                    checked={selectedBrands.has(b.id)}
                    onChange={() => toggleBrand(b.id)}
                  />
                  <span className="truncate">{b.name}</span>
                </label>
              ))}
            </div>
          )}
        </Field>

        {mode === 'edit' && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-callout">활성 상태</span>
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
            disabled={submitting || !name.trim()}
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
