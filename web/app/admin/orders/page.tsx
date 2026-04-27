// Frame Ops Web — 주문리스트
// 기간 + 매입처 탭으로 미발주 판매 항목 필터.
// '발주' 버튼 → Excel / PDF 선택 → 다운로드 시 자동 발주 처리.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface OrderItem {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  product_id: string;
  brand_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  current_stock: number;
  total_quantity: number;
  unit_price: number;
  cost_price: number;
}

interface SupplierGroup {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  items: OrderItem[];
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
}

interface StoreInfo {
  id: string;
  store_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_reg_no: string | null;
}

interface OrdersResponse {
  period: { from: string; to: string };
  store: StoreInfo | null;
  groups: SupplierGroup[];
}

const fetcher = async (url: string): Promise<OrdersResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: OrdersResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// 발주 수량 override 를 sessionStorage 에 저장 — PDF 인쇄 페이지(다른 창)에서도 읽음.
const QTY_OVERRIDE_KEY = 'fo_orders_qty_overrides';
function loadOverrides(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(QTY_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function saveOverrides(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(QTY_OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export default function OrdersPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // 수량 override (product_id → 수량). 다운로드 시 적용.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);
  const setOverride = useCallback((productId: string, qty: number) => {
    setOverrides((prev) => {
      const next = { ...prev, [productId]: Math.max(0, Math.floor(qty)) };
      saveOverrides(next);
      return next;
    });
  }, []);
  const clearOverride = useCallback((productId: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[productId];
      saveOverrides(next);
      return next;
    });
  }, []);

  // 수량 편집 모달용 state
  const [editing, setEditing] = useState<OrderItem | null>(null);

  const url = `/api/admin/orders/pending?from=${from}&to=${to}`;
  const { data, isLoading, mutate } = useSWR<OrdersResponse>(url, fetcher, {
    revalidateOnFocus: false,
  });

  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);

  // 그룹 변동 시 선택 supplier 보정 (없으면 첫 번째로)
  useEffect(() => {
    if (groups.length === 0) {
      if (selectedSupplierId !== null) setSelectedSupplierId(null);
      return;
    }
    const exists = groups.some((g) => g.supplier_id === selectedSupplierId);
    if (!exists) {
      setSelectedSupplierId(groups[0].supplier_id);
    }
  }, [groups, selectedSupplierId]);

  const selected = useMemo(
    () => groups.find((g) => g.supplier_id === selectedSupplierId) ?? null,
    [groups, selectedSupplierId]
  );

  // 발주 처리 마킹
  const markPlaced = useCallback(
    async (group: SupplierGroup) => {
      const res = await fetch('/api/admin/orders/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: group.supplier_id, from, to }),
      });
      const json = (await res.json()) as {
        data: { marked: number } | null;
        error: string | null;
      };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '발주 처리 실패');
        return false;
      }
      toast.success(`발주 처리 완료: ${json.data?.marked ?? 0}건`);
      await mutate();
      return true;
    },
    [from, to, mutate]
  );

  const effectiveQty = useCallback(
    (it: OrderItem) => overrides[it.product_id] ?? it.total_quantity,
    [overrides]
  );

  const handleExcel = useCallback(async () => {
    if (!data || !selected) return;
    setPickerOpen(false);
    setBusy(true);
    try {
      const items = selected.items.map((it) => ({ ...it, qty: effectiveQty(it) }));
      const totalQty = items.reduce((s, it) => s + it.qty, 0);
      const totalCost = items.reduce((s, it) => s + it.qty * it.cost_price, 0);
      const aoa: (string | number)[][] = [
        [`매장: ${data.store?.name ?? '-'} (${data.store?.store_code ?? '-'})`],
        [`매입처: ${selected.supplier_name}${selected.supplier_code ? ` (${selected.supplier_code})` : ''}`],
        [`기간: ${data.period.from} ~ ${data.period.to}`],
        [],
        ['No.', '브랜드', '제품번호', '색상', '수량', '매입가(₩)', '합계(₩)'],
        ...items.map((it, idx) => [
          idx + 1,
          it.brand_name,
          it.style_code ?? '',
          it.color_code ?? '',
          it.qty,
          it.cost_price,
          it.qty * it.cost_price,
        ]),
        [],
        ['합계', '', '', '', totalQty, '', totalCost],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
        { wch: 6 }, { wch: 10 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, selected.supplier_name.slice(0, 30) || '발주');
      const filename = `주문리스트_${selected.supplier_name}_${data.period.from}_${data.period.to}.xlsx`;
      XLSX.writeFile(wb, filename);
      await markPlaced(selected);
    } finally {
      setBusy(false);
    }
  }, [data, selected, markPlaced, effectiveQty]);

  const handlePrint = useCallback(() => {
    if (!selected) return;
    setPickerOpen(false);
    // PDF 인쇄: 인쇄 페이지가 fetch 후 자체 마킹.
    const params = new URLSearchParams({
      supplier_id: selected.supplier_id,
      from,
      to,
      mark: '1',
    });
    window.open(`/admin/orders/print?${params.toString()}`, '_blank');
  }, [selected, from, to]);

  const handlePreview = useCallback(() => {
    if (!selected) return;
    setPickerOpen(false);
    // 미리보기: 마킹 없이 발주서 화면만 노출. 인쇄도 자동 트리거 안 함.
    const params = new URLSearchParams({
      supplier_id: selected.supplier_id,
      from,
      to,
      preview: '1',
    });
    window.open(`/admin/orders/print?${params.toString()}`, '_blank');
  }, [selected, from, to]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">주문리스트</h1>
          <p className="text-caption1 text-[var(--color-label-tertiary)]">
            Excel 또는 PDF 다운로드 시 자동으로 발주 처리되어 다음 검색에서 제외됩니다.
          </p>
        </header>

        {/* 매장 정보 헤더 */}
        {data?.store && (
          <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-headline font-semibold">{data.store.name}</span>
            <span className="text-caption1 text-[var(--color-label-secondary)] font-mono">
              {data.store.store_code}
            </span>
            {data.store.phone && (
              <span className="text-caption1 text-[var(--color-label-tertiary)]">
                ☎ {data.store.phone}
              </span>
            )}
            {data.store.address && (
              <span className="text-caption1 text-[var(--color-label-tertiary)]">
                {data.store.address}
              </span>
            )}
          </div>
        )}

        {/* 기간 필터 + 매입처 탭 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
            <Field label="시작일">
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value || todayDate())}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
            <span className="hidden sm:flex items-center justify-center text-callout text-[var(--color-label-tertiary)] pb-2">
              ~
            </span>
            <Field label="종료일">
              <input
                type="date"
                value={to}
                min={from}
                max={todayDate()}
                onChange={(e) => setTo(e.target.value || todayDate())}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
            <button
              type="button"
              onClick={() => mutate()}
              className="pressable touch-target rounded-lg px-3 py-2 bg-[var(--color-fill-tertiary)] text-callout font-medium"
            >
              새로고침
            </button>
          </div>

          {/* 매입처 탭 */}
          {groups.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--color-separator-opaque)]">
              {groups.map((g) => {
                const active = g.supplier_id === selectedSupplierId;
                return (
                  <button
                    key={g.supplier_id}
                    type="button"
                    onClick={() => setSelectedSupplierId(g.supplier_id)}
                    className={[
                      'pressable touch-target rounded-full px-3 py-1.5 text-caption1 font-medium border transition-colors',
                      active
                        ? 'bg-[var(--color-system-blue)] text-white border-transparent'
                        : 'bg-[var(--color-fill-quaternary)] text-[var(--color-label-primary)] border-[var(--color-separator-opaque)] hover:bg-[var(--color-fill-tertiary)]',
                    ].join(' ')}
                  >
                    {g.supplier_name}
                    <span
                      className={[
                        'ml-1.5 text-caption2 tabular-nums',
                        active ? 'text-white/80' : 'text-[var(--color-label-tertiary)]',
                      ].join(' ')}
                    >
                      {g.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 선택 매입처 컨텐츠 */}
        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !selected ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            기간 내 미발주 항목이 없습니다.
          </p>
        ) : (
          <SupplierContent
            group={selected}
            busy={busy}
            pickerOpen={pickerOpen}
            onTogglePicker={() => setPickerOpen((v) => !v)}
            onClosePicker={() => setPickerOpen(false)}
            onPreview={handlePreview}
            onExcel={handleExcel}
            onPrint={handlePrint}
            getQty={effectiveQty}
            onEditItem={setEditing}
          />
        )}
      </div>

      {/* 수량 편집 모달 */}
      {editing && (
        <QuantityEditDialog
          item={editing}
          initialQty={effectiveQty(editing)}
          onClose={() => setEditing(null)}
          onApply={(qty) => {
            if (qty === editing.total_quantity) clearOverride(editing.product_id);
            else setOverride(editing.product_id, qty);
            setEditing(null);
          }}
        />
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

function SupplierContent({
  group,
  busy,
  pickerOpen,
  onTogglePicker,
  onClosePicker,
  onPreview,
  onExcel,
  onPrint,
  getQty,
  onEditItem,
}: {
  group: SupplierGroup;
  busy: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onPreview: () => void;
  onExcel: () => void;
  onPrint: () => void;
  getQty: (it: OrderItem) => number;
  onEditItem: (it: OrderItem) => void;
}) {
  // 합계는 override 적용 후 재계산
  const itemsQty = group.items.reduce((s, it) => s + getQty(it), 0);
  const itemsCost = group.items.reduce((s, it) => s + getQty(it) * it.cost_price, 0);
  return (
    <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="p-4 flex items-center justify-between flex-wrap gap-2 border-b border-[var(--color-separator-opaque)]">
        <div>
          <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
            {group.supplier_name}
            {group.supplier_code && (
              <span className="ml-2 text-caption1 text-[var(--color-label-tertiary)] font-mono font-normal">
                {group.supplier_code}
              </span>
            )}
          </h2>
          <p className="text-caption1 text-[var(--color-label-secondary)]">
            {group.items.length}품목 / 수량 {itemsQty} / 원가 ₩
            {itemsCost.toLocaleString()}
          </p>
        </div>

        {/* 발주 버튼 + 선택 모달 */}
        <div className="relative">
          <button
            type="button"
            onClick={onTogglePicker}
            disabled={busy}
            className="pressable touch-target rounded-lg px-4 py-2 bg-[var(--color-system-orange)] text-white text-callout font-semibold disabled:opacity-40"
          >
            {busy ? '처리 중…' : '발주 ▾'}
          </button>
          {pickerOpen && !busy && (
            <>
              {/* 바깥 클릭 닫기 */}
              <div className="fixed inset-0 z-40" onClick={onClosePicker} aria-hidden />
              <div
                role="menu"
                className="absolute right-0 mt-2 z-50 min-w-[220px] rounded-xl bg-[var(--color-bg-elevated,var(--color-bg-secondary))] shadow-lg ring-1 ring-[var(--color-separator-opaque)] overflow-hidden"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={onPreview}
                  className="w-full text-left px-3 py-2.5 text-callout hover:bg-[var(--color-fill-quaternary)] flex items-center gap-2"
                >
                  <span className="text-[var(--color-label-primary)] font-semibold">미리보기</span>
                  <span className="text-caption2 text-[var(--color-label-tertiary)]">발주 처리 안 함</span>
                </button>
                <div className="border-t border-[var(--color-separator-opaque)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={onExcel}
                  className="w-full text-left px-3 py-2.5 text-callout hover:bg-[var(--color-fill-quaternary)] flex items-center gap-2"
                >
                  <span className="text-[var(--color-system-green)] font-semibold">EXCEL</span>
                  <span className="text-caption2 text-[var(--color-label-tertiary)]">.xlsx + 발주 처리</span>
                </button>
                <div className="border-t border-[var(--color-separator-opaque)]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={onPrint}
                  className="w-full text-left px-3 py-2.5 text-callout hover:bg-[var(--color-fill-quaternary)] flex items-center gap-2"
                >
                  <span className="text-[var(--color-system-blue)] font-semibold">PDF인쇄</span>
                  <span className="text-caption2 text-[var(--color-label-tertiary)]">인쇄/저장 + 발주 처리</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-callout">
          <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)]">
            <tr>
              <th className="text-left p-3">브랜드</th>
              <th className="text-left p-3">제품</th>
              <th className="text-right p-3 w-16">수량</th>
              <th className="text-right p-3 w-24 hidden sm:table-cell">원가</th>
              <th className="text-right p-3 w-28">합계</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((it) => {
              const qty = getQty(it);
              const overridden = qty !== it.total_quantity;
              const lowStock = it.current_stock === 1;
              const nameClass = lowStock
                ? 'font-bold text-[var(--color-system-red)]'
                : 'font-semibold';
              return (
                <tr
                  key={it.product_id}
                  onClick={() => onEditItem(it)}
                  className="cursor-pointer border-t border-[var(--color-separator-opaque)] hover:bg-[var(--color-fill-quaternary)]"
                  title="클릭 — 수량 편집"
                >
                  <td className="p-3 text-caption1">{it.brand_name}</td>
                  <td className="p-3">
                    <div className={nameClass}>
                      {it.style_code ?? '—'}
                      {it.color_code ? ` / ${it.color_code}` : ''}
                      {lowStock && (
                        <span className="ml-2 text-caption2 font-semibold text-[var(--color-system-red)] bg-[var(--color-system-red)]/10 rounded px-1.5 py-0.5">
                          재고 1
                        </span>
                      )}
                    </div>
                    {it.display_name && it.display_name !== it.style_code && (
                      <div className="text-caption2 text-[var(--color-label-tertiary)] truncate max-w-[260px]">
                        {it.display_name}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    {qty}
                    {overridden && (
                      <span className="ml-1 text-caption2 text-[var(--color-system-orange)]">*</span>
                    )}
                  </td>
                  <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                    ₩{it.cost_price.toLocaleString()}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">
                    ₩{(qty * it.cost_price).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── 수량 편집 다이얼로그 (숫자 키패드) ─────────────────────────────────────
function QuantityEditDialog({
  item,
  initialQty,
  onClose,
  onApply,
}: {
  item: OrderItem;
  initialQty: number;
  onClose: () => void;
  onApply: (qty: number) => void;
}) {
  const [draft, setDraft] = useState<string>(String(initialQty));
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
      // 0 으로 시작하는 다중 자리 방지
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

  const qtyNum = Number(draft) || 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[360px] rounded-2xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-3">
        <header>
          <h3 className="text-headline font-semibold text-[var(--color-label-primary)]">
            수량 편집
          </h3>
          <p className="text-caption1 text-[var(--color-label-secondary)] truncate">
            {item.brand_name} · {item.style_code ?? '—'}
            {item.color_code ? ` / ${item.color_code}` : ''}
          </p>
          {item.current_stock === 1 && (
            <p className="text-caption2 font-semibold text-[var(--color-system-red)] mt-1">
              ⚠ 현재 재고 1개 (전시상품 가능성)
            </p>
          )}
        </header>

        <div className="rounded-xl bg-[var(--color-fill-tertiary)] px-4 py-3 text-center">
          <div className="text-caption2 text-[var(--color-label-tertiary)]">발주 수량</div>
          <div className="text-title1 font-bold tabular-nums text-[var(--color-label-primary)]">
            {qtyNum.toLocaleString()}
          </div>
          {qtyNum !== item.total_quantity && (
            <div className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
              자동집계 {item.total_quantity}
            </div>
          )}
        </div>

        {/* 숫자 키패드 */}
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <KeypadBtn key={d} label={d} onClick={() => append(d)} />
          ))}
          <KeypadBtn label="지움" subtle onClick={clear} />
          <KeypadBtn label="0" onClick={() => append('0')} />
          <KeypadBtn label="⌫" subtle onClick={backspace} />
        </div>

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
            onClick={() => onApply(qtyNum)}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}

function KeypadBtn({
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
