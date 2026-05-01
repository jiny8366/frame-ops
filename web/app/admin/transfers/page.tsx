// Frame Ops Web — 점간이동 (지점간 상품이동)
// 두 탭: 신규 이동 / 이동 내역.
// 신규 이동: 보내는 매장(HQ는 선택, 지점은 본인 고정) + 받는 매장 선택 + 제품 검색·다중 추가 + 라인 테이블.
// 이동 내역: 기간/매장/상품 검색 + 라인 단위 표시.

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { productsSearch } from '@/lib/api-client';
import { useDebounce } from '@/hooks/useDebounce';
import { useSession } from '@/hooks/useSession';
import { formatColor, LINE_LABELS } from '@/lib/product-codes';

interface AccessibleStore {
  id: string;
  store_code: string;
  name: string;
}

interface ProductRow {
  id: string;
  brand_id: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  cost_price: number | null;
  brand_name: string;
  category?: string | null;
  product_line?: string | null;
  stock_quantity?: number | null;
}

interface TransferLine {
  product_id: string;
  brand_name: string;
  style_code: string;
  color_code: string;
  category: string;
  product_line: string;
  quantity: number;
  unit_cost: number;
}

interface TransferReceipt {
  id: string;
  document_at: string;
  note: string | null;
  status: string;
  from_store: { id: string; store_code: string; name: string } | null;
  to_store: { id: string; store_code: string; name: string } | null;
  lines: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
    product: {
      style_code: string | null;
      color_code: string | null;
      category: string | null;
      product_line: string | null;
      brand: { name: string | null } | null;
    } | null;
  }>;
}

const accessibleStoresFetcher = async (url: string): Promise<AccessibleStore[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as {
    data: { stores: AccessibleStore[] } | null;
    error: string | null;
  };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data.stores ?? [];
};

const transfersFetcher = async (url: string): Promise<TransferReceipt[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: TransferReceipt[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function TransfersPage() {
  const { session } = useSession();
  const isHq = session?.role_code?.startsWith('hq_') ?? false;

  const [tab, setTab] = useState<'new' | 'history'>('new');

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">점간이동</h1>

        <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--color-fill-quaternary)]">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'new'}
            onClick={() => setTab('new')}
            className={`pressable touch-target rounded-md px-3 py-2 text-callout font-medium transition-colors ${
              tab === 'new'
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-label-primary)] shadow-sm'
                : 'text-[var(--color-label-secondary)]'
            }`}
          >
            신규 이동
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={`pressable touch-target rounded-md px-3 py-2 text-callout font-medium transition-colors ${
              tab === 'history'
                ? 'bg-[var(--color-bg-primary)] text-[var(--color-label-primary)] shadow-sm'
                : 'text-[var(--color-label-secondary)]'
            }`}
          >
            이동 내역
          </button>
        </div>

        {tab === 'new' ? <NewTransferForm isHq={isHq} sessionStoreId={session?.store_id ?? ''} /> : <HistoryView isHq={isHq} />}
      </div>
    </main>
  );
}

// ── 신규 이동 폼 ────────────────────────────────────────────────────────────
function NewTransferForm({ isHq, sessionStoreId }: { isHq: boolean; sessionStoreId: string }) {
  const { data: stores = [] } = useSWR<AccessibleStore[]>(
    '/api/auth/accessible-stores',
    accessibleStoresFetcher
  );

  const [fromStoreId, setFromStoreId] = useState<string>('');
  const [toStoreId, setToStoreId] = useState<string>('');
  const [documentDate, setDocumentDate] = useState<string>(todayIso());
  const [note, setNote] = useState<string>('');
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 보내는 매장 — HQ는 사용자가 직접 선택 (자동 선택 안 함), 비-HQ는 본인 매장 고정
  useEffect(() => {
    if (isHq) {
      // 자동 선택 X — '선택' 옵션이 기본값으로 보이도록 빈 문자열 유지
      return;
    }
    setFromStoreId(sessionStoreId);
  }, [isHq, sessionStoreId]);

  // 제품 검색
  const [query, setQuery] = useState('');
  const [keepSearch, setKeepSearch] = useState(false);
  const debouncedQuery = useDebounce(query, 200);

  const { data: results = [], isValidating: searching } = useSWR<ProductRow[]>(
    debouncedQuery ? ['transfer-search', debouncedQuery] : null,
    async () => {
      const { data, error } = await productsSearch(debouncedQuery, null, 30, 0);
      if (error) throw new Error(error);
      return (data ?? []) as ProductRow[];
    },
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  const handleAddProduct = useCallback(
    (p: ProductRow) => {
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
            brand_name: p.brand_name,
            style_code: p.style_code ?? '—',
            color_code: p.color_code ?? '',
            category: p.category ?? '',
            product_line: p.product_line ?? '',
            quantity: 1,
            // 정책: 상품코드 등록 시 적용한 매입가 (cost_price) 자동 적용
            unit_cost: p.cost_price ?? 0,
          },
        ];
      });
      if (!keepSearch) setQuery('');
    },
    [keepSearch]
  );

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

  const canSubmit =
    fromStoreId && toStoreId && fromStoreId !== toStoreId && lines.length > 0 && lines.every((l) => l.quantity > 0);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit || submitting) return;
      setSubmitting(true);
      try {
        const docAt = documentDate
          ? new Date(`${documentDate}T12:00:00+09:00`).toISOString()
          : new Date().toISOString();
        const res = await fetch('/api/admin/transfers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from_store_id: fromStoreId,
            to_store_id: toStoreId,
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
          data: { id: string; lines_created: number } | null;
          error: string | null;
        };
        if (!res.ok || json.error) {
          toast.error(json.error ?? '점간이동 생성 실패');
          return;
        }
        toast.success(`점간이동 등록 완료 — ${json.data?.lines_created}건`);
        setLines([]);
        setNote('');
        setDocumentDate(todayIso());
        setQuery('');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, submitting, documentDate, fromStoreId, toStoreId, note, lines]
  );

  const fromStore = stores.find((s) => s.id === fromStoreId);
  const toStoreOptions = stores.filter((s) => s.id !== fromStoreId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label={isHq ? '보내는 매장' : '보내는 매장 (본인)'}>
          {isHq ? (
            <select
              value={fromStoreId}
              onChange={(e) => setFromStoreId(e.target.value)}
              required
              className={[
                'w-full rounded-xl border bg-[var(--color-bg-primary)] px-3 py-2 text-callout',
                fromStoreId
                  ? 'border-[var(--color-separator-opaque)]'
                  : 'border-[var(--color-system-orange)]',
              ].join(' ')}
            >
              <option value="">선택</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.store_code})
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-3 py-2 text-callout">
              {fromStore?.name ?? '본인 매장'} {fromStore?.store_code ? `(${fromStore.store_code})` : ''}
            </div>
          )}
        </Field>
        <Field label="받는 매장">
          <select
            value={toStoreId}
            onChange={(e) => setToStoreId(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          >
            <option value="">선택</option>
            {toStoreOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.store_code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="이동일자">
          <input
            type="date"
            value={documentDate}
            max={todayIso()}
            onChange={(e) => setDocumentDate(e.target.value || todayIso())}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
          />
        </Field>
        <div className="md:col-span-3">
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
      </div>

      {/* 제품 검색 */}
      <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="transfer-search-input" className="text-caption1 text-[var(--color-label-secondary)]">
              제품 검색 (제품번호 / 제품명 / 색상)
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
              id="transfer-search-input"
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
                  {r.color_code ? ` / ${formatColor(r.color_code)}` : ''}
                </span>
                <span className="text-caption2 text-[var(--color-label-tertiary)] tabular-nums">
                  매입가 ₩{(r.cost_price ?? 0).toLocaleString()}
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
      </div>

      {/* 라인 테이블 */}
      <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
        {lines.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
            위 검색에서 제품을 추가하세요
          </p>
        ) : (
          <div className="data-list-scroll">
            <table className="data-list-table">
              <thead>
                <tr>
                  <th>라인</th>
                  <th>카테고리</th>
                  <th>브랜드</th>
                  <th>제품번호</th>
                  <th>컬러</th>
                  <th className="num">수량</th>
                  <th className="num">단가</th>
                  <th className="num">합계</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.product_id}>
                    <td>
                      {l.product_line
                        ? LINE_LABELS[l.product_line as keyof typeof LINE_LABELS] ?? l.product_line.toUpperCase()
                        : '—'}
                    </td>
                    <td>{l.category || '—'}</td>
                    <td>{l.brand_name || '—'}</td>
                    <td className="code">{l.style_code}</td>
                    <td className="code">{formatColor(l.color_code)}</td>
                    <td className="num">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => handleQty(idx, Number(e.target.value) || 0)}
                        className="w-16 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={100}
                        value={l.unit_cost}
                        onChange={(e) => handleCost(idx, Number(e.target.value) || 0)}
                        className="w-24 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      ₩{(l.quantity * l.unit_cost).toLocaleString()}
                    </td>
                    <td className="num">
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
              <tfoot>
                <tr>
                  <td colSpan={5}>합계</td>
                  <td className="num">{totalQty}</td>
                  <td></td>
                  <td className="num">₩{totalCost.toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
      >
        {submitting
          ? '저장 중…'
          : `점간이동 등록 (${lines.length}품목 / ₩${totalCost.toLocaleString()})`}
      </button>

      <p className="text-caption2 text-[var(--color-label-tertiary)]">
        ※ 단가는 상품 등록 시 매입가 자동 적용 — 필요 시 행에서 수정 가능. 재고 자동 반영은 RPC 추가 시 동작.
      </p>
    </form>
  );
}

// ── 이동 내역 ───────────────────────────────────────────────────────────────
function HistoryView({ isHq }: { isHq: boolean }) {
  const { data: stores = [] } = useSWR<AccessibleStore[]>(
    '/api/auth/accessible-stores',
    accessibleStoresFetcher
  );

  const [fromStoreId, setFromStoreId] = useState<string>('');
  const [toStoreId, setToStoreId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>(todayIso());
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [productQuery, setProductQuery] = useState('');
  const debouncedProductQuery = useDebounce(productQuery, 250);

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    if (fromStoreId) sp.set('from_store_id', fromStoreId);
    if (toStoreId) sp.set('to_store_id', toStoreId);
    if (dateFrom) sp.set('date_from', dateFrom);
    if (dateTo) sp.set('date_to', dateTo);
    if (debouncedProductQuery) sp.set('product_query', debouncedProductQuery);
    sp.set('limit', '200');
    return `/api/admin/transfers?${sp.toString()}`;
  }, [fromStoreId, toStoreId, dateFrom, dateTo, debouncedProductQuery]);

  const { data: transfers = [], isLoading } = useSWR<TransferReceipt[]>(url, transfersFetcher);

  const flatLines = useMemo(() => {
    const rows: Array<{
      receipt: TransferReceipt;
      line: TransferReceipt['lines'][number];
      lineIndex: number;
      lineCountInReceipt: number;
    }> = [];
    for (const r of transfers) {
      const ls = r.lines ?? [];
      ls.forEach((l, i) => {
        rows.push({ receipt: r, line: l, lineIndex: i + 1, lineCountInReceipt: ls.length });
      });
    }
    return rows;
  }, [transfers]);

  const summary = useMemo(() => {
    let qty = 0;
    let cost = 0;
    for (const row of flatLines) {
      qty += row.line.quantity;
      cost += row.line.quantity * row.line.unit_cost;
    }
    return { qty, cost };
  }, [flatLines]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        {isHq && (
          <Field label="보내는 매장">
            <select
              value={fromStoreId}
              onChange={(e) => setFromStoreId(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {isHq && (
          <Field label="받는 매장">
            <select
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="시작일">
          <input
            type="date"
            value={dateFrom}
            max={dateTo || todayIso()}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
          />
        </Field>
        <Field label="종료일">
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={todayIso()}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
          />
        </Field>
        <Field label="상품 검색">
          <input
            type="search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="비워두면 전체"
            className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-caption1 text-[var(--color-label-secondary)]">
          전표 {transfers.length}건 · 라인 {flatLines.length}개 · 수량 {summary.qty}점
        </span>
        <span className="text-callout font-semibold tabular-nums">
          합계 ₩{summary.cost.toLocaleString()}
        </span>
      </div>

      <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : flatLines.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            조건에 맞는 점간이동 내역이 없습니다.
          </p>
        ) : (
          <div className="data-list-scroll">
            <table className="data-list-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>보내는 매장</th>
                  <th>받는 매장</th>
                  <th>카테고리</th>
                  <th className="num">라인</th>
                  <th>브랜드</th>
                  <th>제품번호</th>
                  <th>컬러</th>
                  <th className="num">수량</th>
                  <th className="num">단가</th>
                  <th className="num">합계</th>
                </tr>
              </thead>
              <tbody>
                {flatLines.map(({ receipt, line, lineIndex, lineCountInReceipt }) => {
                  const p = line.product;
                  const subtotal = line.quantity * line.unit_cost;
                  return (
                    <tr key={line.id}>
                      <td className="num" style={{ textAlign: 'left' }}>
                        {receipt.document_at.slice(0, 10)}
                      </td>
                      <td>{receipt.from_store?.name ?? '—'}</td>
                      <td>{receipt.to_store?.name ?? '—'}</td>
                      <td>{p?.category ?? '—'}</td>
                      <td className="num meta">{lineIndex}/{lineCountInReceipt}</td>
                      <td>{p?.brand?.name ?? '—'}</td>
                      <td className="code">{p?.style_code ?? '—'}</td>
                      <td className="code">{formatColor(p?.color_code)}</td>
                      <td className="num">{line.quantity}</td>
                      <td className="num">₩{line.unit_cost.toLocaleString()}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        ₩{subtotal.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={8}>합계</td>
                  <td className="num">{summary.qty}</td>
                  <td></td>
                  <td className="num">₩{summary.cost.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
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
