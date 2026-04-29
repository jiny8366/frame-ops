// Frame Ops Web — 매입 전표 편집 다이얼로그
// 헤더(매입처/입고일자/비고) 수정 + 라인별 수량·단가 수정 + 라인 삭제 + 전표 전체 삭제.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { mutate as globalMutate } from 'swr';
import { formatColor } from '@/lib/product-codes';
import type { Receipt, ReceiptLine } from './page';

interface Supplier {
  id: string;
  name: string;
  supplier_code: string | null;
}

interface Props {
  receipt: Receipt;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

interface EditableLine extends ReceiptLine {
  // 화면용 dirty flag
  dirty?: boolean;
}

export function EditReceiptDialog({ receipt, suppliers, onClose, onSaved }: Props) {
  const [supplierId, setSupplierId] = useState<string>(receipt.supplier_id ?? '');
  const [documentAt, setDocumentAt] = useState<string>(receipt.document_at.slice(0, 10));
  const [note, setNote] = useState<string>(receipt.note ?? '');
  const [lines, setLines] = useState<EditableLine[]>(() =>
    receipt.lines.map((l) => ({ ...l }))
  );
  const [busy, setBusy] = useState(false);

  // ESC 닫기
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [busy, onClose]);

  const headerDirty =
    (receipt.supplier_id ?? '') !== supplierId ||
    receipt.document_at.slice(0, 10) !== documentAt ||
    (receipt.note ?? '') !== (note ?? '');

  const handleLineChange = useCallback(
    (lineId: string, patch: Partial<Pick<EditableLine, 'quantity' | 'unit_cost'>>) => {
      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                ...patch,
                dirty:
                  (patch.quantity !== undefined && patch.quantity !== receipt.lines.find((x) => x.id === lineId)?.quantity) ||
                  (patch.unit_cost !== undefined && patch.unit_cost !== receipt.lines.find((x) => x.id === lineId)?.unit_cost) ||
                  l.dirty === true,
              }
            : l
        )
      );
    },
    [receipt.lines]
  );

  const refreshGlobalCaches = useCallback(() => {
    void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/inbound'));
    void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/inventory'));
  }, []);

  const handleSaveLine = useCallback(
    async (line: EditableLine) => {
      const orig = receipt.lines.find((x) => x.id === line.id);
      if (!orig) return;
      if (line.quantity === orig.quantity && line.unit_cost === orig.unit_cost) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/inbound/lines/${line.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: line.quantity, unit_cost: line.unit_cost }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          toast.error(json.error ?? '라인 수정 실패');
          return;
        }
        toast.success('라인 수정 완료');
        setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, dirty: false } : l)));
        refreshGlobalCaches();
        await onSaved();
      } finally {
        setBusy(false);
      }
    },
    [receipt.lines, onSaved, refreshGlobalCaches]
  );

  const handleDeleteLine = useCallback(
    async (line: EditableLine) => {
      if (!confirm(`이 라인을 삭제할까요?\n${line.product?.style_code ?? ''}${line.product?.color_code ? ` / ${formatColor(line.product.color_code)}` : ''} (${line.quantity}점)\n재고가 ${line.quantity}점 차감됩니다.`)) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/inbound/lines/${line.id}`, { method: 'DELETE' });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          toast.error(json.error ?? '라인 삭제 실패');
          return;
        }
        toast.success('라인 삭제 완료');
        setLines((prev) => prev.filter((l) => l.id !== line.id));
        refreshGlobalCaches();
        await onSaved();
      } finally {
        setBusy(false);
      }
    },
    [onSaved, refreshGlobalCaches]
  );

  const handleSaveHeader = useCallback(async () => {
    if (!headerDirty) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inbound/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId || null,
          document_at: documentAt
            ? new Date(`${documentAt}T12:00:00+09:00`).toISOString()
            : undefined,
          note: note || null,
        }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '저장 실패');
        return;
      }
      toast.success('전표 정보 수정 완료');
      refreshGlobalCaches();
      await onSaved();
    } finally {
      setBusy(false);
    }
  }, [headerDirty, receipt.id, supplierId, documentAt, note, onSaved, refreshGlobalCaches]);

  const handleDeleteReceipt = useCallback(async () => {
    if (
      !confirm(
        `이 매입 전표 전체를 삭제할까요?\n라인 ${lines.length}건의 수량만큼 재고가 차감됩니다.\n이 작업은 되돌릴 수 없습니다.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inbound/${receipt.id}`, { method: 'DELETE' });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '삭제 실패');
        return;
      }
      toast.success('전표 삭제 완료');
      refreshGlobalCaches();
      await onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }, [lines.length, receipt.id, onClose, onSaved, refreshGlobalCaches]);

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-[820px] flex flex-col gap-4 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
            매입 전표 편집
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="pressable rounded-lg px-3 py-1.5 text-callout bg-[var(--color-fill-tertiary)]"
          >
            닫기
          </button>
        </div>

        {/* 헤더 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="매입처">
            <select
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
              value={documentAt}
              onChange={(e) => setDocumentAt(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <Field label="비고">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveHeader}
            disabled={!headerDirty || busy}
            className="pressable rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
          >
            전표 정보 저장
          </button>
        </div>

        {/* 라인 */}
        <div className="rounded-xl bg-[var(--color-bg-primary)] overflow-hidden">
          {lines.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
              라인이 모두 삭제되었습니다.
            </p>
          ) : (
            <div className="data-list-scroll">
            <table className="data-list-table">
              <thead>
                <tr>
                  <th>브랜드</th>
                  <th>제품번호</th>
                  <th>컬러</th>
                  <th className="num">수량</th>
                  <th className="num">단가</th>
                  <th className="num">금액</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.product?.brand?.name ?? '—'}</td>
                    <td className="code">{l.product?.style_code ?? '—'}</td>
                    <td className="code">{formatColor(l.product?.color_code)}</td>
                    <td className="num">
                      <input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) =>
                          handleLineChange(l.id, { quantity: Math.max(1, Number(e.target.value) || 0) })
                        }
                        className="w-20 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={l.unit_cost}
                        onChange={(e) =>
                          handleLineChange(l.id, { unit_cost: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-24 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      ₩{(l.quantity * l.unit_cost).toLocaleString()}
                    </td>
                    <td className="num">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSaveLine(l)}
                          disabled={!l.dirty || busy}
                          className="pressable rounded-lg px-2 py-1 bg-[var(--color-system-blue)] text-white disabled:opacity-30"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLine(l)}
                          disabled={busy}
                          className="pressable rounded-lg px-2 py-1 bg-[var(--color-system-red)] text-white disabled:opacity-30"
                          aria-label="라인 삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>합계</td>
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

        {/* 위험 영역 */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-separator-opaque)]">
          <p className="text-caption1 text-[var(--color-label-tertiary)]">
            전표 전체 삭제 시 모든 라인의 수량만큼 재고가 차감됩니다.
          </p>
          <button
            type="button"
            onClick={handleDeleteReceipt}
            disabled={busy}
            className="pressable rounded-xl bg-[var(--color-system-red)] px-4 py-2 text-callout font-semibold text-white disabled:opacity-40"
          >
            전표 전체 삭제
          </button>
        </div>
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
