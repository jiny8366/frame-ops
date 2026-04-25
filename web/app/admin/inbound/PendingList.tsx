// Frame Ops Web — 매입 대기 리스트 (주문 리스트 모드)
// 재고 < 0 인 제품을 매입처별로 필터하여 체크 → 라인 일괄 추가.

'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { toast } from 'sonner';

interface PendingRow {
  product_id: string;
  brand_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  stock_quantity: number;
  pending_count: number;
  cost_price: number;
  inbound_hold: boolean;
}

interface AddedLine {
  product_id: string;
  style_code: string;
  color_code: string;
  display_name: string;
  brand_name: string;
  quantity: number;
  unit_cost: number;
}

export interface PendingListProps {
  supplierId: string;
  /** 부모(매입 등록 페이지) 의 라인 목록에 추가하는 콜백 */
  onAddLines: (lines: AddedLine[]) => void;
}

const fetcher = async (url: string): Promise<PendingRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: PendingRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

interface DraftRow {
  checked: boolean;
  quantity: number;
  unit_cost: number;
}

export function PendingList({ supplierId, onAddLines }: PendingListProps) {
  const url = `/api/admin/inbound/pending${supplierId ? `?supplier_id=${supplierId}` : ''}`;
  const { data: rows = [], isLoading, mutate } = useSWR<PendingRow[]>(url, fetcher);

  const [showHeld, setShowHeld] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  // 표시할 행 필터 (보류 항목 토글)
  const visible = useMemo(
    () => (showHeld ? rows : rows.filter((r) => !r.inbound_hold)),
    [rows, showHeld]
  );

  // 행 토글 시 draft 초기화 (재고 부족분을 기본 수량, cost_price 를 기본 단가)
  const draftFor = useCallback(
    (row: PendingRow): DraftRow => {
      const d = drafts[row.product_id];
      if (d) return d;
      return { checked: false, quantity: row.pending_count, unit_cost: row.cost_price };
    },
    [drafts]
  );

  const updateDraft = useCallback((id: string, patch: Partial<DraftRow>, init: DraftRow) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...init, ...prev[id], ...patch },
    }));
  }, []);

  const handleHold = useCallback(
    async (productId: string, nextHold: boolean, mutator: KeyedMutator<PendingRow[]>) => {
      const res = await fetch('/api/admin/inbound/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, hold: nextHold }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '보류 변경 실패');
        return;
      }
      toast.success(nextHold ? '보류 처리됨' : '보류 해제됨');
      await mutator();
    },
    []
  );

  const checkedCount = useMemo(
    () => visible.filter((r) => drafts[r.product_id]?.checked).length,
    [visible, drafts]
  );

  const handleAddSelected = useCallback(() => {
    const lines: AddedLine[] = visible
      .filter((r) => drafts[r.product_id]?.checked)
      .map((r) => {
        const d = drafts[r.product_id];
        return {
          product_id: r.product_id,
          style_code: r.style_code ?? '—',
          color_code: r.color_code ?? '',
          display_name: r.display_name ?? '',
          brand_name: r.brand_name,
          quantity: Math.max(1, d.quantity || 0),
          unit_cost: Math.max(0, d.unit_cost || 0),
        };
      });
    if (lines.length === 0) {
      toast.info('체크된 항목이 없습니다.');
      return;
    }
    onAddLines(lines);
    // 추가된 항목은 체크 해제
    setDrafts((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        next[l.product_id] = { ...next[l.product_id], checked: false } as DraftRow;
      }
      return next;
    });
    toast.success(`${lines.length}건 라인에 추가됨`);
  }, [visible, drafts, onAddLines]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-caption1 text-[var(--color-label-secondary)]">
          {supplierId
            ? '선택한 매입처 브랜드의 매입 대기 제품'
            : '전체 매입 대기 제품 (매입처 선택 시 필터)'}
          {' · '}
          총 {visible.length}건
        </p>
        <label className="flex items-center gap-1.5 text-caption1 text-[var(--color-label-secondary)]">
          <input
            type="checkbox"
            checked={showHeld}
            onChange={(e) => setShowHeld(e.target.checked)}
          />
          보류 항목 표시
        </label>
      </div>

      {isLoading ? (
        <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-6">
          불러오는 중…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-caption1 text-[var(--color-label-tertiary)] text-center py-6">
          매입 대기 제품이 없습니다.
        </p>
      ) : (
        <div className="overflow-auto rounded-lg max-h-[420px] border border-[var(--color-separator-opaque)]">
          <table className="w-full text-callout">
            <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="text-left p-2">제품</th>
                <th className="text-right p-2 w-16 hidden sm:table-cell">부족</th>
                <th className="text-right p-2 w-20">수량</th>
                <th className="text-right p-2 w-24">단가</th>
                <th className="p-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const init: DraftRow = {
                  checked: false,
                  quantity: r.pending_count,
                  unit_cost: r.cost_price,
                };
                const d = draftFor(r);
                return (
                  <tr
                    key={r.product_id}
                    className={`border-t border-[var(--color-separator-opaque)] ${r.inbound_hold ? 'opacity-50' : ''}`}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={d.checked}
                        disabled={r.inbound_hold}
                        onChange={(e) => updateDraft(r.product_id, { checked: e.target.checked }, init)}
                      />
                    </td>
                    <td className="p-2">
                      <div className="text-caption2 text-[var(--color-label-secondary)]">
                        {r.brand_name}
                      </div>
                      <div className="font-semibold">
                        {r.style_code ?? '—'}
                        {r.color_code ? ` / ${r.color_code}` : ''}
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums hidden sm:table-cell">
                      {r.pending_count}
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={1}
                        value={d.quantity || ''}
                        onChange={(e) =>
                          updateDraft(r.product_id, { quantity: Number(e.target.value) || 0 }, init)
                        }
                        className="w-16 rounded border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={d.unit_cost || ''}
                        onChange={(e) =>
                          updateDraft(r.product_id, { unit_cost: Number(e.target.value) || 0 }, init)
                        }
                        className="w-20 rounded border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleHold(r.product_id, !r.inbound_hold, mutate)}
                        className="pressable text-caption1 text-[var(--color-system-orange)]"
                      >
                        {r.inbound_hold ? '복귀' : '보류'}
                      </button>
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
        onClick={handleAddSelected}
        disabled={checkedCount === 0}
        className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
      >
        선택 {checkedCount}건 라인에 추가
      </button>
    </div>
  );
}
