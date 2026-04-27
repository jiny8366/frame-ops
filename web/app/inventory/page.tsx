// Frame Ops Web — 재고 조회
// fo_products 의 활성 상품을 stock_quantity 기준으로 정렬·검색·필터.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { useSession } from '@/hooks/useSession';
import { hasPermission } from '@/lib/auth/permissions';

interface ProductRow {
  id: string;
  product_code: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  category: string | null;
  product_line: string | null;
  cost_price: number | null;
  sale_price: number | null;
  stock_quantity: number | null;
  brand: { id: string; name: string } | null;
}

interface Resp { data: ProductRow[] | null; error: string | null }

const fetcher = async (url: string): Promise<ProductRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as Resp;
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function InventoryPage() {
  const { session } = useSession();
  const canEditStock = hasPermission(session?.permissions, 'inventory_edit_stock');

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'low' | 'style' | 'recent'>('style');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  // 페이지 진입 시 자동 fetch 안 함. 검색어 입력 또는 '전체 보기' 클릭 시에만.
  const shouldFetch = query.trim().length > 0 || showAll;
  const { data: items = [], isLoading, mutate } = useSWR<ProductRow[]>(
    shouldFetch ? '/api/inventory?limit=500' : null,
    fetcher,
    { refreshInterval: shouldFetch ? 60_000 : 0 }
  );

  const filtered = useMemo(() => {
    let arr = items;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((p) =>
        (p.style_code ?? '').toLowerCase().includes(q) ||
        (p.color_code ?? '').toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.brand?.name ?? '').toLowerCase().includes(q)
      );
    }
    arr = [...arr];
    if (sortMode === 'low') {
      arr.sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0));
    } else if (sortMode === 'style') {
      arr.sort((a, b) => (a.style_code ?? '').localeCompare(b.style_code ?? ''));
    }
    return arr;
  }, [items, query, sortMode]);

  const lowCount = items.filter((p) => (p.stock_quantity ?? 0) <= 1).length;
  const totalQty = items.reduce((s, p) => s + (p.stock_quantity ?? 0), 0);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">재고 조회</h1>

        {/* 요약 — 데이터 로드된 경우만 노출 */}
        {shouldFetch && (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-3 gap-3">
            <SummaryStat label="총 상품" value={items.length} />
            <SummaryStat label="총 재고" value={totalQty} />
            <SummaryStat label="잔량 ≤ 1" value={lowCount} highlight />
          </div>
        )}

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption1 text-[var(--color-label-secondary)]">검색</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="브랜드 / 스타일코드 / 색상 / 제품명"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </label>
          <div className="flex flex-wrap gap-1 items-center justify-between">
            <div className="flex gap-1">
              <SortBtn label="스타일순" active={sortMode === 'style'} onClick={() => setSortMode('style')} />
              <SortBtn label="재고 적은순" active={sortMode === 'low'} onClick={() => setSortMode('low')} />
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAll((v) => !v);
                if (!showAll) setQuery('');
              }}
              className={[
                'pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border',
                showAll
                  ? 'bg-[var(--color-system-blue)] text-white border-transparent'
                  : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]',
              ].join(' ')}
            >
              {showAll ? '전체 보기 (해제)' : '전체 보기'}
            </button>
          </div>
        </div>

        {/* 리스트 */}
        <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {!shouldFetch ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              검색어를 입력하거나 &lsquo;전체 보기&rsquo; 를 클릭하세요.
            </p>
          ) : isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 상품이 없습니다.
            </p>
          ) : (
            <div className="overflow-auto max-h-[720px]">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
                  <tr>
                    <th className="text-left p-3">브랜드</th>
                    <th className="text-left p-3">상품</th>
                    <th className="text-left p-3 hidden sm:table-cell">분류</th>
                    <th className="text-right p-3 w-20">재고</th>
                    <th className="text-right p-3 w-24 hidden md:table-cell">원가</th>
                    <th className="text-right p-3 w-28">판매가</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const rawStock = p.stock_quantity;
                    const stock = rawStock ?? 0;
                    const isUnknown = rawStock === null;
                    const isNegative = stock < 0;
                    const isOut = stock === 0;
                    const isLow = stock === 1;
                    return (
                      <tr
                        key={p.id}
                        onClick={canEditStock ? () => setEditing(p) : undefined}
                        className={[
                          'border-t border-[var(--color-separator-opaque)]',
                          canEditStock
                            ? 'cursor-pointer hover:bg-[var(--color-fill-quaternary)]'
                            : '',
                        ].join(' ')}
                        title={canEditStock ? '클릭 — 재고 수량 편집' : undefined}
                      >
                        <td className="p-3 text-caption1">{p.brand?.name ?? '—'}</td>
                        <td className="p-3">
                          <div className="font-semibold">
                            {p.style_code ?? '—'}
                            {p.color_code ? ` / ${p.color_code}` : ''}
                          </div>
                          {p.display_name && p.display_name !== p.style_code && (
                            <div className="text-caption2 text-[var(--color-label-tertiary)] truncate max-w-[260px]">
                              {p.display_name}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-caption1 text-[var(--color-label-secondary)] hidden sm:table-cell">
                          {[p.category, p.product_line].filter(Boolean).join('/') || '—'}
                        </td>
                        <td className="p-3 text-right tabular-nums font-semibold">
                          <span
                            className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full text-caption1',
                              isNegative || isOut
                                ? 'bg-[var(--color-system-red)]/15 text-[var(--color-system-red)]'
                                : isLow
                                  ? 'bg-[var(--color-system-orange)]/15 text-[var(--color-system-orange)]'
                                  : isUnknown
                                    ? 'text-[var(--color-label-tertiary)]'
                                    : '',
                            ].join(' ')}
                          >
                            {isUnknown ? '—' : stock}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums hidden md:table-cell">
                          ₩{(p.cost_price ?? 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          ₩{(p.sale_price ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <StockEditDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await mutate();
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}

// ── 재고 수량 편집 다이얼로그 (숫자 키패드) ───────────────────────────
function StockEditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: ProductRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = item.stock_quantity ?? 0;
  const [draft, setDraft] = useState<string>(String(initial));
  const [submitting, setSubmitting] = useState(false);
  // 첫 키 입력은 기존 값 대체. 이후엔 append.
  const freshRef = useRef(true);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const append = useCallback((d: string) => {
    setDraft((prev) => {
      if (freshRef.current) {
        freshRef.current = false;
        return d;
      }
      const next = (prev === '0' ? '' : prev) + d;
      return next.slice(0, 5);
    });
  }, []);
  const backspace = useCallback(() => {
    freshRef.current = false;
    setDraft((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);
  const clear = useCallback(() => {
    freshRef.current = false;
    setDraft('0');
  }, []);

  const qtyNum = Number(draft) || 0;
  const dirty = qtyNum !== initial;

  const handleSave = useCallback(async () => {
    if (!dirty || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${item.id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_quantity: qtyNum }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '저장 실패');
        setSubmitting(false);
        return;
      }
      toast.success(`재고 ${qtyNum} 으로 갱신`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '네트워크 오류');
      setSubmitting(false);
    }
  }, [dirty, submitting, qtyNum, item.id, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-[360px] rounded-2xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
        <header>
          <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
            재고 수량 수정
          </h3>
          <p className="text-caption1 text-[var(--color-label-secondary)] truncate">
            {item.brand?.name ?? '—'} · {item.style_code ?? '—'}
            {item.color_code ? ` / ${item.color_code}` : ''}
          </p>
        </header>

        <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-4 py-3 text-center">
          <div className="text-caption2 text-[var(--color-label-tertiary)]">재고 수량</div>
          <div className="text-title1 font-bold tabular-nums text-[var(--color-label-primary)]">
            {qtyNum.toLocaleString()}
          </div>
          {dirty && (
            <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
              현재 {initial}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <KeyBtn key={d} label={d} onClick={() => append(d)} />
          ))}
          <KeyBtn label="지움" subtle onClick={clear} />
          <KeyBtn label="0" onClick={() => append('0')} />
          <KeyBtn label="⌫" subtle onClick={backspace} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyBtn({
  label,
  subtle,
  onClick,
}: {
  label: string;
  subtle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'pressable touch-target-lg rounded-xl text-title2 font-medium',
        subtle
          ? 'bg-[var(--color-fill-secondary)] text-[var(--color-label-secondary)]'
          : 'bg-[var(--color-bg-elevated,var(--color-bg-primary))] text-[var(--color-label-primary)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption2 text-[var(--color-label-tertiary)]">{label}</span>
      <span
        className={`text-headline font-bold tabular-nums ${
          highlight && value > 0 ? 'text-[var(--color-system-orange)]' : 'text-[var(--color-label-primary)]'
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border',
        active
          ? 'bg-[var(--color-system-blue)] text-white border-transparent'
          : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
