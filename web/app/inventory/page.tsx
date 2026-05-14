// Frame Ops Web — 재고 조회
// 목록 현재고 = API stock_quantity (매장별 fo_stock 우선, 없으면 fo_products.stock_quantity).
// 수동 재고 저장 후에는 전체 리스트를 다시 받지 않고 해당 행만 패치 + 스크롤 유지(SWR revalidate: false).
// 매입/판매 열은 전표 라인 집계(참고). computed_stock 은 API 참고값.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useSession } from '@/hooks/useSession';
import { hasPermission } from '@/lib/auth/permissions';
import { formatColor, LINE_LABELS } from '@/lib/product-codes';

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
  /** 매장별 fo_stock 우선, 없으면 fo_products.stock_quantity (수동 편집·동기화) */
  stock_quantity: number | null;
  /** 거래 이력 합산: 매입 누계 */
  total_inbound: number;
  /** 거래 이력 합산: 판매 누계 */
  total_sold: number;
  /** total_inbound - total_sold (이력 기준 참고값; 화면 현재고는 stock_quantity) */
  computed_stock: number;
  brand_id: string | null;
  brand_name: string | null;
  /** 호환성 — 기존 코드 일부에서 brand?.name 으로 접근 */
  brand?: { id: string; name: string } | null;
}

interface Resp { data: ProductRow[] | null; error: string | null }

/** 목록·요약과 편집 다이얼로그 동일 원장(API stock_quantity). */
function displayQty(p: ProductRow): number {
  const v = p.stock_quantity;
  if (v == null || Number.isNaN(Number(v))) return 0;
  return Number(v);
}

const fetcher = async (url: string): Promise<ProductRow[]> => {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Pragma: 'no-cache' },
  });
  const json = (await res.json()) as Resp;
  if (json.error) throw new Error(json.error);
  // brand 호환 필드 채움 (기존 코드 일부가 p.brand?.name 사용)
  return (json.data ?? []).map((p) => ({
    ...p,
    brand: p.brand_id ? { id: p.brand_id, name: p.brand_name ?? '' } : null,
  }));
};

export default function InventoryPage() {
  const { session } = useSession();
  const canEditStock = hasPermission(session?.permissions, 'inventory_edit_stock');

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'low' | 'style' | 'recent'>('style');
  const [showAll, setShowAll] = useState(false);
  /** 행 객체를 보관하면 SWR 재검증 후에도 과거 스냅샷이 남아 목록 숫자와 다이얼로그만 어긋난 것처럼 보일 수 있음 → id 로만 두고 매번 최신 items 에서 해석 */
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  // 페이지 진입 시 자동 fetch 안 함. 검색어 입력 또는 '전체 보기' 클릭 시에만.
  const shouldFetch = query.trim().length > 0 || showAll;
  const { data: items = [], isLoading, mutate } = useSWR<ProductRow[]>(
    shouldFetch ? '/api/inventory?limit=500' : null,
    fetcher,
    {
      refreshInterval: shouldFetch ? 60_000 : 0,
      revalidateOnFocus: true,
      dedupingInterval: 0,
    }
  );

  const editingRow = useMemo(
    () => (editingProductId ? items.find((p) => p.id === editingProductId) ?? null : null),
    [editingProductId, items],
  );

  useEffect(() => {
    if (editingProductId && !editingRow) {
      setEditingProductId(null);
    }
  }, [editingProductId, editingRow]);

  const filtered = useMemo(() => {
    let arr = items;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((p) =>
        (p.style_code ?? '').toLowerCase().includes(q) ||
        (p.color_code ?? '').toLowerCase().includes(q) ||
        (p.display_name ?? '').toLowerCase().includes(q) ||
        (p.brand_name ?? '').toLowerCase().includes(q)
      );
    }
    arr = [...arr];
    if (sortMode === 'low') {
      arr.sort((a, b) => displayQty(a) - displayQty(b));
    } else if (sortMode === 'style') {
      arr.sort((a, b) => (a.style_code ?? '').localeCompare(b.style_code ?? ''));
    }
    return arr;
  }, [items, query, sortMode]);

  const lowCount = items.filter((p) => displayQty(p) <= 1).length;
  const totalQty = items.reduce((s, p) => s + displayQty(p), 0);

  // 엑셀 다운로드 — 현재 필터/정렬 적용된 결과를 라인/카테고리/브랜드/제품번호/컬러/현재고 컬럼으로 저장.
  const handleExportXlsx = useCallback(() => {
    if (filtered.length === 0) {
      toast.error('내려받을 상품이 없습니다.');
      return;
    }
    const aoa: (string | number)[][] = [
      ['NO.', '라인', '카테고리', '브랜드', '제품번호', '컬러번호', '현재고'],
      ...filtered.map((p, idx) => [
        idx + 1,
        p.product_line
          ? LINE_LABELS[p.product_line as keyof typeof LINE_LABELS] ?? p.product_line.toUpperCase()
          : '',
        p.category ?? '',
        p.brand_name ?? '',
        p.style_code ?? '',
        formatColor(p.color_code),
        displayQty(p),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 5 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
      { wch: 14 }, { wch: 10 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
      .format(new Date())
      .replace(/-/g, '');
    XLSX.writeFile(wb, `재고_상품코드_${today}.xlsx`);
    toast.success(`Excel 다운로드 — ${filtered.length}건`);
  }, [filtered]);

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
            <div className="flex gap-2 flex-wrap">
              {canEditStock && (
                <a
                  href="/inventory/audit"
                  title="실재고조사 엑셀 업로드 — 조사일 이후 거래량 자동 보정"
                  className="pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]"
                >
                  📋 재고조사 업로드
                </a>
              )}
              <button
                type="button"
                onClick={handleExportXlsx}
                disabled={!shouldFetch || filtered.length === 0}
                title="라인 / 카테고리 / 브랜드 / 제품번호 / 컬러번호 / 현재고 컬럼으로 Excel 저장"
                className="pressable touch-target rounded-lg px-3 py-2 text-caption1 font-medium border bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)] disabled:opacity-40"
              >
                📥 Excel 다운로드
              </button>
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
            <div ref={listScrollRef} className="data-list-scroll" style={{ maxHeight: 720 }}>
              <table className="data-list-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th>라인</th>
                    <th>카테고리</th>
                    <th>브랜드</th>
                    <th>제품번호</th>
                    <th>컬러</th>
                    <th className="num">매입</th>
                    <th className="num">판매</th>
                    <th className="num">현재고</th>
                    <th className="num">매입가</th>
                    <th className="num">판매가</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const stock = displayQty(p);
                    const isNegative = stock < 0;
                    const isOut = stock === 0;
                    const isLow = stock === 1;
                    return (
                      <tr
                        key={p.id}
                        onClick={canEditStock ? () => setEditingProductId(p.id) : undefined}
                        style={canEditStock ? { cursor: 'pointer' } : undefined}
                        title={canEditStock ? '클릭 — 재고 수량 편집' : undefined}
                      >
                        <td>
                          {p.product_line
                            ? p.product_line.toUpperCase()
                            : '—'}
                        </td>
                        <td>{p.category ?? '—'}</td>
                        <td>{p.brand_name ?? '—'}</td>
                        <td className="code">{p.style_code ?? '—'}</td>
                        <td className="code">{formatColor(p.color_code)}</td>
                        <td className="num">{p.total_inbound}</td>
                        <td className="num">{p.total_sold}</td>
                        <td className="num">
                          <span
                            className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full',
                              isNegative || isOut
                                ? 'bg-[var(--color-system-red)]/15 text-[var(--color-system-red)]'
                                : isLow
                                  ? 'bg-[var(--color-system-orange)]/15 text-[var(--color-system-orange)]'
                                  : '',
                            ].join(' ')}
                            style={{ fontWeight: 600 }}
                          >
                            {stock}
                          </span>
                        </td>
                        <td className="num">₩{(p.cost_price ?? 0).toLocaleString()}</td>
                        <td className="num" style={{ fontWeight: 600 }}>
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

      {editingRow && (
        <StockEditDialog
          item={editingRow}
          onClose={() => setEditingProductId(null)}
          onSaved={async (productId, newQty) => {
            const el = listScrollRef.current;
            const scrollTop = el?.scrollTop ?? 0;
            await mutate(
              (prev) => {
                if (!prev) return prev;
                return prev.map((row) =>
                  row.id === productId ? { ...row, stock_quantity: newQty } : row
                );
              },
              { revalidate: false }
            );
            requestAnimationFrame(() => {
              if (listScrollRef.current) {
                listScrollRef.current.scrollTop = scrollTop;
              }
            });
            setEditingProductId(null);
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
  /** 저장 성공 시 — 서버 재조회 없이 부모가 해당 행만 갱신 */
  onSaved: (productId: string, newQuantity: number) => void | Promise<void>;
}) {
  const serverQty = displayQty(item);
  const [draft, setDraft] = useState<string>(String(serverQty));
  const [submitting, setSubmitting] = useState(false);
  // 첫 키 입력은 기존 값 대체. 이후엔 append.
  const freshRef = useRef(true);
  const userEditedRef = useRef(false);

  useEffect(() => {
    userEditedRef.current = false;
    setDraft(String(serverQty));
    freshRef.current = true;
    // 상품 행 교체만 (id 변경). 같은 줄의 serverQty는 이 시점의 렌더 값을 사용.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 id 만 추적
  }, [item.id]);

  useEffect(() => {
    if (userEditedRef.current || submitting) return;
    const nextStr = String(serverQty);
    setDraft((prev) => {
      if (prev === nextStr) return prev;
      freshRef.current = true;
      return nextStr;
    });
  }, [serverQty, submitting]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const append = useCallback((d: string) => {
    userEditedRef.current = true;
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
    userEditedRef.current = true;
    freshRef.current = false;
    setDraft((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  }, []);
  const clear = useCallback(() => {
    userEditedRef.current = true;
    freshRef.current = false;
    setDraft('0');
  }, []);

  const qtyNum = Number(draft) || 0;
  const dirty = qtyNum !== serverQty;

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
      await Promise.resolve(onSaved(item.id, qtyNum));
      setSubmitting(false);
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
            {item.color_code ? ` / ${formatColor(item.color_code)}` : ''}
          </p>
        </header>

        <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-4 py-3 text-center">
          <div className="text-caption2 text-[var(--color-label-tertiary)]">재고 수량</div>
          <div className="text-title1 font-bold tabular-nums text-[var(--color-label-primary)]">
            {qtyNum.toLocaleString()}
          </div>
          {dirty && (
            <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
              현재 {serverQty}
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
