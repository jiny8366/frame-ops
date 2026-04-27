// Frame Ops Web — 주문리스트 (매입 등록 탭)
// 발주처리됐으나 매입처리 안 된 sale_items 의 매입처×제품별 집계 표시.
// 행 체크 + 수량 조정 (키패드) + 차액 처리(주문대기/주문보류) → 매입 처리 일괄 실행.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';

interface PendingRow {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  product_id: string;
  brand_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  current_stock: number;
  ordered_at_min: string | null;
  ordered_qty: number;
  cost_price: number;
}

interface ApiResp { rows: PendingRow[] }

interface Draft {
  checked: boolean;
  qty: number; // 사용자가 적용한 수량 (기본 = ordered_qty)
  remainderAction: 'pending' | 'hold'; // 차액 처리 방식
}

const fetcher = async (url: string): Promise<PendingRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: ApiResp | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data.rows;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export interface PendingListProps {
  /** 처리 후 부모에게 알림 (스낵바 등). 부모가 추가 동작을 하지 않으면 null 가능. */
  onProcessed?: () => void;
}

export function PendingList({ onProcessed }: PendingListProps) {
  const url = '/api/admin/inbound/pending';
  const { data: rows = [], isLoading, mutate } = useSWR<PendingRow[]>(url, fetcher);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<PendingRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const draftFor = useCallback(
    (r: PendingRow): Draft =>
      drafts[r.product_id] ?? { checked: false, qty: r.ordered_qty, remainderAction: 'pending' },
    [drafts]
  );

  const updateDraft = useCallback((productId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => {
      const base = prev[productId] ?? { checked: false, qty: 0, remainderAction: 'pending' };
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  }, []);

  const checkedRows = useMemo(
    () => rows.filter((r) => drafts[r.product_id]?.checked),
    [rows, drafts]
  );

  const handleSubmit = useCallback(async () => {
    if (checkedRows.length === 0) {
      toast.info('체크된 항목이 없습니다.');
      return;
    }
    setSubmitting(true);
    try {
      const items = checkedRows.map((r) => {
        const d = drafts[r.product_id]!;
        const diff = r.ordered_qty - d.qty;
        return {
          product_id: r.product_id,
          received_qty: d.qty,
          remainder_action: diff > 0 ? d.remainderAction : 'none',
        };
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json()) as {
        data: { processed: number; failed: number } | null;
        error: string | null;
      };
      if (!res.ok || (json.error && json.data?.processed === 0)) {
        toast.error(json.error ?? '매입 처리 실패');
        return;
      }
      toast.success(
        `매입 처리 ${json.data?.processed ?? 0}건 완료${
          json.data?.failed ? ` / 실패 ${json.data.failed}건` : ''
        }`
      );
      setDrafts({});
      await mutate();
      onProcessed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류');
    } finally {
      setSubmitting(false);
    }
  }, [checkedRows, drafts, mutate, onProcessed]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption1 text-[var(--color-label-secondary)]">
        발주처리됐으나 매입(입고) 안 된 항목 — 총 {rows.length}건. 수량 셀을 누르면 키패드로 변경.
      </p>

      {isLoading ? (
        <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-6">
          불러오는 중…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-6">
          매입 대기 항목이 없습니다.
        </p>
      ) : (
        <div className="overflow-auto rounded-lg max-h-[480px] border border-[var(--color-separator-opaque)]">
          <table className="w-full text-callout">
            <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
              <tr>
                <th className="text-left p-2">매입처</th>
                <th className="text-left p-2 w-16">주문일자</th>
                <th className="text-left p-2">브랜드</th>
                <th className="text-left p-2">제품번호</th>
                <th className="text-left p-2 w-14">색상</th>
                <th className="text-right p-2 w-16 hidden sm:table-cell">현재고</th>
                <th className="text-right p-2 w-24 hidden md:table-cell">매입가</th>
                <th className="text-right p-2 w-20">수량</th>
                <th className="text-center p-2 w-20">매입처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = draftFor(r);
                const diff = r.ordered_qty - d.qty;
                return (
                  <tr
                    key={r.product_id}
                    className="border-t border-[var(--color-separator-opaque)]"
                  >
                    <td className="p-2 text-caption1">
                      <div>{r.supplier_name}</div>
                      {r.supplier_code && (
                        <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                          {r.supplier_code}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-caption1 tabular-nums">
                      {fmtDate(r.ordered_at_min)}
                    </td>
                    <td className="p-2 text-caption1">{r.brand_name ?? '—'}</td>
                    <td className="p-2 font-semibold">{r.style_code ?? '—'}</td>
                    <td className="p-2 text-caption1">{r.color_code ?? '—'}</td>
                    <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                      <span
                        className={
                          r.current_stock < 0
                            ? 'text-[var(--color-system-red)]'
                            : r.current_stock <= 1
                              ? 'text-[var(--color-system-orange)]'
                              : ''
                        }
                      >
                        {r.current_stock}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums hidden md:table-cell">
                      ₩{r.cost_price.toLocaleString()}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="pressable rounded-md px-2 py-1 bg-[var(--color-fill-tertiary)] tabular-nums font-semibold"
                      >
                        {d.qty}
                        {diff !== 0 && (
                          <span className="ml-1 text-caption2 text-[var(--color-system-orange)]">
                            *
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={d.checked}
                        onChange={(e) =>
                          updateDraft(r.product_id, { checked: e.target.checked })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || checkedRows.length === 0}
        className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
      >
        {submitting ? '처리 중…' : `매입 처리 (${checkedRows.length}건)`}
      </button>

      {editing && (
        <QtyEditDialog
          row={editing}
          initialDraft={draftFor(editing)}
          onClose={() => setEditing(null)}
          onApply={(qty, action) => {
            updateDraft(editing.product_id, { qty, remainderAction: action });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── 수량 편집 모달 (숫자 키패드 + 차액 처리 선택) ─────────────────────
function QtyEditDialog({
  row,
  initialDraft,
  onClose,
  onApply,
}: {
  row: PendingRow;
  initialDraft: Draft;
  onClose: () => void;
  onApply: (qty: number, action: 'pending' | 'hold') => void;
}) {
  const [draft, setDraft] = useState<string>(String(initialDraft.qty));
  const [action, setAction] = useState<'pending' | 'hold'>(initialDraft.remainderAction);
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
      return next.slice(0, 4);
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

  const qtyNum = Math.min(Number(draft) || 0, row.ordered_qty);
  const diff = row.ordered_qty - qtyNum;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[380px] rounded-2xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
        <header>
          <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
            매입 수량 입력
          </h3>
          <p className="text-caption1 text-[var(--color-label-secondary)] truncate">
            {row.supplier_name} · {row.brand_name ?? ''} · {row.style_code ?? '—'}
            {row.color_code ? ` / ${row.color_code}` : ''}
          </p>
        </header>

        <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-4 py-3 text-center">
          <div className="text-caption2 text-[var(--color-label-tertiary)]">매입 수량</div>
          <div className="text-title1 font-bold tabular-nums text-[var(--color-label-primary)]">
            {qtyNum.toLocaleString()}
          </div>
          <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
            발주 {row.ordered_qty} · 현재고 {row.current_stock}
          </div>
          <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
            매입가 ₩{row.cost_price.toLocaleString()} ×{' '}
            {qtyNum.toLocaleString()} = ₩{(qtyNum * row.cost_price).toLocaleString()}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <KeyBtn key={d} label={d} onClick={() => append(d)} />
          ))}
          <KeyBtn label="지움" subtle onClick={clear} />
          <KeyBtn label="0" onClick={() => append('0')} />
          <KeyBtn label="⌫" subtle onClick={backspace} />
        </div>

        {/* 차액 처리 선택 — 수량이 줄었을 때만 활성 */}
        {diff > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-caption1 text-[var(--color-label-secondary)]">
              차액 {diff}개 처리
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction('pending')}
                className={[
                  'pressable touch-target rounded-lg px-3 py-2 text-callout font-medium border',
                  action === 'pending'
                    ? 'bg-[var(--color-system-blue)] text-white border-transparent'
                    : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]',
                ].join(' ')}
              >
                주문대기 (재발주)
              </button>
              <button
                type="button"
                onClick={() => setAction('hold')}
                className={[
                  'pressable touch-target rounded-lg px-3 py-2 text-callout font-medium border',
                  action === 'hold'
                    ? 'bg-[var(--color-system-orange)] text-white border-transparent'
                    : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)]',
                ].join(' ')}
              >
                주문보류 (대기 제외)
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onApply(qtyNum, action)}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold"
          >
            적용
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
