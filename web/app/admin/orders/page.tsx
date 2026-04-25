// Frame Ops Web — 주문리스트
// 기간 + 매입처 탭으로 미발주 판매 항목 필터.
// '발주' 버튼 → Excel / PDF 선택 → 다운로드 시 자동 발주 처리.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function OrdersPage() {
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const url = `/api/admin/orders/pending?from=${from}&to=${to}`;
  const { data, isLoading, mutate } = useSWR<OrdersResponse>(url, fetcher, {
    revalidateOnFocus: false,
  });

  const groups = data?.groups ?? [];

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

  const handleExcel = useCallback(async () => {
    if (!data || !selected) return;
    setPickerOpen(false);
    setBusy(true);
    try {
      const aoa: (string | number)[][] = [
        [`매장: ${data.store?.name ?? '-'} (${data.store?.store_code ?? '-'})`],
        [`매입처: ${selected.supplier_name}${selected.supplier_code ? ` (${selected.supplier_code})` : ''}`],
        [`기간: ${data.period.from} ~ ${data.period.to}`],
        [],
        ['브랜드', '스타일코드', '색상', '제품명', '수량', '원가(₩)', '합계(₩)'],
        ...selected.items.map((it) => [
          it.brand_name,
          it.style_code ?? '',
          it.color_code ?? '',
          it.display_name ?? '',
          it.total_quantity,
          it.cost_price,
          it.total_quantity * it.cost_price,
        ]),
        [],
        ['합계', '', '', '', selected.total_quantity, '', selected.total_cost],
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 24 },
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
  }, [data, selected, markPlaced]);

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
          />
        )}
      </div>
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
}: {
  group: SupplierGroup;
  busy: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onClosePicker: () => void;
  onPreview: () => void;
  onExcel: () => void;
  onPrint: () => void;
}) {
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
            {group.items.length}품목 / 수량 {group.total_quantity} / 원가 ₩
            {group.total_cost.toLocaleString()}
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
            {group.items.map((it) => (
              <tr
                key={it.product_id}
                className="border-t border-[var(--color-separator-opaque)]"
              >
                <td className="p-3 text-caption1">{it.brand_name}</td>
                <td className="p-3">
                  <div className="font-semibold">
                    {it.style_code ?? '—'}
                    {it.color_code ? ` / ${it.color_code}` : ''}
                  </div>
                  {it.display_name && it.display_name !== it.style_code && (
                    <div className="text-caption2 text-[var(--color-label-tertiary)] truncate max-w-[260px]">
                      {it.display_name}
                    </div>
                  )}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {it.total_quantity}
                </td>
                <td className="p-3 text-right tabular-nums hidden sm:table-cell">
                  ₩{it.cost_price.toLocaleString()}
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  ₩{(it.total_quantity * it.cost_price).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
