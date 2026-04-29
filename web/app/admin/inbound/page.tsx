// Frame Ops Web — 매입 등록
// 두 가지 입력 방식:
//   1) 제품 검색 모드 — 직접 검색 후 라인 추가 (ad-hoc 매입)
//   2) 주문리스트 모드 — 발주처리됐으나 매입 안 된 항목, 행 단위 매입처리
// 주문리스트 탭은 자체적으로 매입 처리 (parent 폼 거치지 않음).

'use client';

import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { productsSearch } from '@/lib/api-client';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import { PendingList } from './PendingList';

interface Supplier {
  id: string;
  supplier_code: string | null;
  name: string;
  contact: string | null;
  business_number: string | null;
  active: boolean;
}

interface ProductRow {
  id: string;
  brand_id: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  sale_price: number | null;
  cost_price: number | null;
  stock_quantity: number | null;
  brand_name: string;
}

interface InboundLine {
  product_id: string;
  style_code: string;
  color_code: string;
  display_name: string;
  brand_name: string;
  quantity: number;
  unit_cost: number;
}

const supplierFetcher = async (url: string): Promise<Supplier[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: Supplier[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function InboundPage() {
  const { data: suppliers = [] } = useSWR<Supplier[]>('/api/admin/suppliers', supplierFetcher);

  // 전표 정보
  const [supplierId, setSupplierId] = useState<string>('');
  const [documentDate, setDocumentDate] = useState<string>(todayIso());
  const [note, setNote] = useState<string>('');

  // 라인
  const [lines, setLines] = useState<InboundLine[]>([]);

  // 입력 모드: 'search' = 제품 검색, 'pending' = 주문 대기 리스트
  const [mode, setMode] = useState<'search' | 'pending'>('search');

  // 제품 검색
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  // 검색 결과 유지 — 체크 시 항목 선택 후에도 검색어/결과 리스트를 닫지 않아 연속 추가 가능.
  const [keepSearch, setKeepSearch] = useState(false);

  const { data: results = [], isValidating: searching } = useSWR<ProductRow[]>(
    debouncedQuery ? ['inbound-search', debouncedQuery] : null,
    async () => {
      const { data, error } = await productsSearch(debouncedQuery, null, 30, 0);
      if (error) throw new Error(error);
      return (data ?? []) as ProductRow[];
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const [submitting, setSubmitting] = useState(false);
  const [showSupplierWarning, setShowSupplierWarning] = useState(false);
  const supplierSelectRef = useRef<HTMLSelectElement>(null);

  // 라인 추가 (이미 있는 product 면 수량 +1) — 검색 모드용
  // keepSearch 가 true 이면 검색어를 유지해 결과 리스트를 닫지 않음 (연속 선택).
  const handleAddProduct = useCallback((p: ProductRow) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          style_code: p.style_code ?? '—',
          color_code: p.color_code ?? '',
          display_name: p.display_name ?? '',
          brand_name: p.brand_name,
          quantity: 1,
          unit_cost: p.cost_price ?? 0,
        },
      ];
    });
    if (!keepSearch) setQuery('');
  }, [keepSearch]);

  const handleQty = useCallback((idx: number, value: number) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: Math.max(0, value) };
      return next;
    });
  }, []);

  const handleCost = useCallback((idx: number, value: number) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], unit_cost: Math.max(0, value) };
      return next;
    });
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const totalQty = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
  const totalCost = useMemo(
    () => lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0),
    [lines]
  );

  const canSubmit = lines.length > 0 && lines.every((l) => l.quantity > 0);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit || submitting) return;
      if (!supplierId) {
        setShowSupplierWarning(true);
        return;
      }
      setSubmitting(true);

      const [y, m, d] = documentDate.split('-').map(Number);
      const docAt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0).toISOString();

      try {
        const res = await fetch('/api/admin/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supplier_id: supplierId || null,
            document_at: docAt,
            note: note || null,
            lines: lines.map((l) => ({
              product_id: l.product_id,
              quantity: l.quantity,
              unit_cost: l.unit_cost,
            })),
          }),
        });
        const json = (await res.json()) as {
          data: { receipt_id: string; lines_created: number; total_cost: number } | null;
          error: string | null;
        };
        if (!res.ok || json.error || !json.data) {
          toast.error(json.error ?? '저장 실패');
          setSubmitting(false);
          return;
        }
        toast.success(
          `매입 등록 완료 — ${json.data.lines_created}건 / ₩${(json.data.total_cost ?? 0).toLocaleString()}`,
          { duration: 3000 }
        );
        // 초기화
        setLines([]);
        setSupplierId('');
        setNote('');
        setDocumentDate(todayIso());
        setQuery('');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '네트워크 오류');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, submitting, documentDate, supplierId, note, lines]
  );

  const focusSupplierAndCloseWarning = useCallback(() => {
    setShowSupplierWarning(false);
    // 다이얼로그 닫힘 후 select 에 포커스 + dropdown 열기 시도
    setTimeout(() => {
      const el = supplierSelectRef.current;
      if (el) {
        el.focus();
        // 일부 브라우저에서 select dropdown 자동 열기 (지원 안 되면 그냥 포커스만)
        try {
          el.showPicker?.();
        } catch {
          /* showPicker 미지원 브라우저 — 포커스만 */
        }
      }
    }, 0);
  }, []);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <form onSubmit={handleSubmit} className="max-w-[900px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매입 등록</h1>

        {/* 전표 정보 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="매입처">
            <select
              ref={supplierSelectRef}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">선택 안 함 (직매입)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.supplier_code ? ` (${s.supplier_code})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="입고일자">
            <input
              type="date"
              value={documentDate}
              max={todayIso()}
              onChange={(e) => setDocumentDate(e.target.value || todayIso())}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <Field label="비고">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="선택 입력"
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        {/* 입력 모드 탭 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--color-fill-quaternary)]">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'search'}
              onClick={() => setMode('search')}
              className={`pressable touch-target rounded-md px-3 py-2 text-callout font-medium transition-colors ${
                mode === 'search'
                  ? 'bg-[var(--color-bg-primary)] text-[var(--color-label-primary)] shadow-sm'
                  : 'text-[var(--color-label-secondary)]'
              }`}
            >
              제품 검색
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'pending'}
              onClick={() => setMode('pending')}
              className={`pressable touch-target rounded-md px-3 py-2 text-callout font-medium transition-colors ${
                mode === 'pending'
                  ? 'bg-[var(--color-bg-primary)] text-[var(--color-label-primary)] shadow-sm'
                  : 'text-[var(--color-label-secondary)]'
              }`}
            >
              주문리스트
            </button>
          </div>

          {mode === 'search' ? (
            <>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="inbound-search-input" className="text-caption1 text-[var(--color-label-secondary)]">
                    제품 검색 (스타일코드 / 제품명 / 색상)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none text-caption1 text-[var(--color-label-secondary)]">
                    <input
                      type="checkbox"
                      checked={keepSearch}
                      onChange={(e) => setKeepSearch(e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-system-blue)]"
                    />
                    <span>검색항목 유지</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="inbound-search-input"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      keepSearch
                        ? '연속 선택 모드 — 클릭마다 라인 추가 (수량 +1)'
                        : '검색 후 결과 카드를 클릭해 추가'
                    }
                    className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                  />
                  {searching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-system-blue)] border-t-transparent" />
                  )}
                </div>
              </div>

              {debouncedQuery && results.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[260px] overflow-auto">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleAddProduct(r)}
                      className="pressable touch-target flex flex-col items-start gap-0.5 p-2 rounded-lg bg-[var(--color-bg-primary)] text-left border border-[var(--color-separator-opaque)] hover:border-[var(--color-system-blue)]"
                    >
                      <span className="text-caption2 text-[var(--color-label-secondary)] truncate w-full">
                        {r.brand_name}
                      </span>
                      <span className="text-callout font-semibold truncate w-full">
                        {r.style_code ?? '—'}
                        {r.color_code ? ` / ${r.color_code}` : ''}
                      </span>
                      <span className="text-caption2 text-[var(--color-label-tertiary)] tabular-nums">
                        재고 {r.stock_quantity ?? 0} · 매입가 ₩
                        {(r.cost_price ?? 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {debouncedQuery && !searching && results.length === 0 && (
                <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-4">
                  “{debouncedQuery}” 검색 결과 없음
                </p>
              )}
            </>
          ) : (
            <PendingList />
          )}
        </div>

        {/* 라인 리스트 + 등록 버튼 — 제품 검색 모드 전용 */}
        {mode === 'search' && (
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {lines.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
              위 검색에서 제품을 추가하세요
            </p>
          ) : (
            <table className="w-full text-callout">
              <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
                <tr>
                  <th className="text-left p-3">제품</th>
                  <th className="text-right p-3 w-24">수량</th>
                  <th className="text-right p-3 w-28">단가</th>
                  <th className="text-right p-3 w-28 hidden sm:table-cell">금액</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.product_id} className="border-t border-[var(--color-separator-opaque)]">
                    <td className="p-3">
                      <div className="text-caption2 text-[var(--color-label-secondary)]">
                        {l.brand_name}
                      </div>
                      <div className="font-semibold">
                        {l.style_code}
                        {l.color_code ? ` / ${l.color_code}` : ''}
                      </div>
                      {l.display_name && l.display_name !== l.style_code && (
                        <div className="text-caption2 text-[var(--color-label-tertiary)] truncate">
                          {l.display_name}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => handleQty(idx, Number(e.target.value) || 0)}
                        className="w-20 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="p-3 text-right">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={100}
                        value={l.unit_cost}
                        onChange={(e) => handleCost(idx, Number(e.target.value) || 0)}
                        className="w-24 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="p-3 text-right hidden sm:table-cell tabular-nums">
                      ₩{(l.quantity * l.unit_cost).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="pressable text-[var(--color-system-red)]"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[var(--color-fill-quaternary)] text-callout">
                <tr>
                  <td className="p-3 font-semibold text-[var(--color-label-secondary)]">합계</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{totalQty}</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right font-semibold tabular-nums hidden sm:table-cell">
                    ₩{totalCost.toLocaleString()}
                  </td>
                  <td className="p-3"></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        )}

        {mode === 'search' && (
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
        >
          {submitting
            ? '저장 중…'
            : `매입 등록 (${lines.length}품목 / ₩${totalCost.toLocaleString()})`}
        </button>
        )}
      </form>

      {showSupplierWarning && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSupplierWarning(false);
          }}
        >
          <div className="w-full max-w-[360px] rounded-2xl bg-[var(--color-bg-secondary)] p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="text-title2" aria-hidden>⚠️</span>
              <div>
                <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  매입처가 선택되지 않았습니다.
                </h3>
                <p className="mt-1 text-caption1 text-[var(--color-label-secondary)]">
                  매입 등록 전 매입처를 먼저 선택해 주세요.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={focusSupplierAndCloseWarning}
              className="pressable touch-target rounded-xl px-4 py-3 bg-[var(--color-system-blue)] text-white font-semibold"
            >
              매입처 선택
            </button>
          </div>
        </div>
      )}
    </main>
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
