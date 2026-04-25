// Frame Ops Web — 주문리스트
// 기간 선택 → 발주 처리되지 않은 판매 항목을 매입처별·제품 단위로 합산.
// Excel 또는 PDF 인쇄로 다운로드하면 자동으로 발주 처리되어 다음 검색에서 제외됨.

'use client';

import { useCallback, useState } from 'react';
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
  const [busy, setBusy] = useState<string | null>(null); // supplier_id whose action is in progress

  const url = `/api/admin/orders/pending?from=${from}&to=${to}`;
  const { data, isLoading, mutate } = useSWR<OrdersResponse>(url, fetcher, {
    revalidateOnFocus: false,
  });

  // 다운로드 후 발주 처리 마킹 (다음 검색에서 제외)
  const markPlaced = useCallback(
    async (group: SupplierGroup) => {
      try {
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
          toast.error(json.error ?? '발주 처리 마킹 실패');
          return;
        }
        toast.success(`발주 처리 완료: ${json.data?.marked ?? 0}건 (다음 검색에서 제외)`);
        await mutate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '네트워크 오류');
      }
    },
    [from, to, mutate]
  );

  // ── Excel 다운로드 (클라이언트 측 xlsx 생성) → 자동 발주 처리 ───────────
  const downloadExcel = useCallback(
    async (group: SupplierGroup) => {
      if (!data) return;
      if (
        !confirm(
          `${group.supplier_name} 매입처 ${group.items.length}품목을 Excel 다운로드합니다. 다운로드 후 발주 처리되어 다음 검색에서 제외됩니다. 계속하시겠습니까?`
        )
      ) {
        return;
      }
      setBusy(group.supplier_id);
      try {
        const aoa: (string | number)[][] = [
          [`매장: ${data.store?.name ?? '-'} (${data.store?.store_code ?? '-'})`],
          [`매입처: ${group.supplier_name}${group.supplier_code ? ` (${group.supplier_code})` : ''}`],
          [`기간: ${data.period.from} ~ ${data.period.to}`],
          [],
          ['브랜드', '스타일코드', '색상', '제품명', '수량', '원가(₩)', '합계(₩)'],
          ...group.items.map((it) => [
            it.brand_name,
            it.style_code ?? '',
            it.color_code ?? '',
            it.display_name ?? '',
            it.total_quantity,
            it.cost_price,
            it.total_quantity * it.cost_price,
          ]),
          [],
          ['합계', '', '', '', group.total_quantity, '', group.total_cost],
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = [
          { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 24 },
          { wch: 6 }, { wch: 10 }, { wch: 12 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, group.supplier_name.slice(0, 30) || '발주');
        const filename = `주문리스트_${group.supplier_name}_${data.period.from}_${data.period.to}.xlsx`;
        XLSX.writeFile(wb, filename);
        await markPlaced(group);
      } finally {
        setBusy(null);
      }
    },
    [data, markPlaced]
  );

  // ── PDF (인쇄용 페이지 새 창) → 자동 발주 처리 ────────────────────────
  const openPrint = useCallback(
    async (group: SupplierGroup) => {
      if (
        !confirm(
          `${group.supplier_name} 매입처 ${group.items.length}품목을 PDF 인쇄합니다. 인쇄 후 발주 처리되어 다음 검색에서 제외됩니다. 계속하시겠습니까?`
        )
      ) {
        return;
      }
      setBusy(group.supplier_id);
      try {
        const params = new URLSearchParams({
          supplier_id: group.supplier_id,
          from,
          to,
        });
        window.open(`/admin/orders/print?${params.toString()}`, '_blank');
        await markPlaced(group);
      } finally {
        setBusy(null);
      }
    },
    [from, to, markPlaced]
  );

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

        {/* 기간 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-2 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
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

        {/* 매입처별 그룹 */}
        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data || data.groups.length === 0 ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            기간 내 미발주 항목이 없습니다.
            <br />
            <span className="text-caption1">
              (매입처 매핑이 안 된 브랜드는 제외됩니다 — 매장 관리자에게 \`fo_supplier_brands\` 등록 요청)
            </span>
          </p>
        ) : (
          data.groups.map((g) => (
            <SupplierGroupCard
              key={g.supplier_id}
              group={g}
              busy={busy === g.supplier_id}
              onExcel={downloadExcel}
              onPrint={openPrint}
            />
          ))
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

function SupplierGroupCard({
  group,
  busy,
  onExcel,
  onPrint,
}: {
  group: SupplierGroup;
  busy: boolean;
  onExcel: (g: SupplierGroup) => void;
  onPrint: (g: SupplierGroup) => void;
}) {
  const handleExcel = useCallback(() => onExcel(group), [onExcel, group]);
  const handlePrint = useCallback(() => onPrint(group), [onPrint, group]);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExcel}
            disabled={busy}
            className="pressable touch-target rounded-lg px-3 py-2 bg-[var(--color-system-green)]/15 text-[var(--color-system-green)] text-caption1 font-semibold disabled:opacity-40"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={busy}
            className="pressable touch-target rounded-lg px-3 py-2 bg-[var(--color-system-blue)]/15 text-[var(--color-system-blue)] text-caption1 font-semibold disabled:opacity-40"
          >
            PDF 인쇄
          </button>
          {busy && (
            <span className="text-caption1 text-[var(--color-label-tertiary)]">처리 중…</span>
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
