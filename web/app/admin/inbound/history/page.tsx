// Frame Ops Web — 매입 내역 조회/수정
// 매입처 / 입고일자 / 상품(검색·전체) 필터로 등록된 매입 전표를 조회하고
// 클릭 시 편집 다이얼로그에서 헤더·라인 단위로 수정·삭제.

'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useDebounce } from '@/hooks/useDebounce';
import { formatColor } from '@/lib/product-codes';
import { EditReceiptDialog } from './EditReceiptDialog';

interface Supplier {
  id: string;
  name: string;
  supplier_code: string | null;
}

interface ProductRef {
  id: string;
  product_code: string | null;
  display_name: string | null;
  brand_id: string | null;
  style_code: string | null;
  color_code: string | null;
  category: string | null;
  brand: { name: string | null } | null;
}

export interface ReceiptLine {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  product: ProductRef | null;
}

export interface Receipt {
  id: string;
  document_at: string;
  note: string | null;
  created_at: string;
  supplier_id: string | null;
  supplier: { name: string | null; supplier_code: string | null } | null;
  lines: ReceiptLine[];
}

const supplierFetcher = async (url: string): Promise<Supplier[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: Supplier[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

const receiptFetcher = async (url: string): Promise<Receipt[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: Receipt[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export default function InboundHistoryPage() {
  const { data: suppliers = [] } = useSWR<Supplier[]>('/api/admin/suppliers', supplierFetcher);

  const [supplierId, setSupplierId] = useState('');
  // 기본값: 시작일·종료일 모두 오늘. 필요 시 사용자가 범위를 넓혀 검색.
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [productQuery, setProductQuery] = useState('');
  const debouncedProductQuery = useDebounce(productQuery, 250);

  const url = useMemo(() => {
    const sp = new URLSearchParams();
    if (supplierId) sp.set('supplier_id', supplierId);
    if (dateFrom) sp.set('date_from', dateFrom);
    if (dateTo) sp.set('date_to', dateTo);
    if (debouncedProductQuery) sp.set('product_query', debouncedProductQuery);
    sp.set('limit', '200');
    return `/api/admin/inbound?${sp.toString()}`;
  }, [supplierId, dateFrom, dateTo, debouncedProductQuery]);

  const { data: receipts = [], isLoading, mutate } = useSWR<Receipt[]>(url, receiptFetcher);
  const [editing, setEditing] = useState<Receipt | null>(null);

  const handleClose = useCallback(() => setEditing(null), []);
  const handleSaved = useCallback(async () => {
    await mutate();
  }, [mutate]);

  // 라인 단위 평탄화 — 표시는 라인 한 줄, 행 클릭 시 receipt 편집 다이얼로그 오픈.
  // receipt별 라인 인덱스(1-based)도 함께 부여하여 "라인" 컬럼에 표시.
  const flatLines = useMemo(() => {
    const rows: Array<{
      receipt: Receipt;
      line: ReceiptLine;
      lineIndex: number;
      lineCountInReceipt: number;
    }> = [];
    for (const r of receipts) {
      const lines = r.lines ?? [];
      lines.forEach((l, i) => {
        rows.push({ receipt: r, line: l, lineIndex: i + 1, lineCountInReceipt: lines.length });
      });
    }
    return rows;
  }, [receipts]);

  const summary = useMemo(() => {
    let qty = 0;
    let cost = 0;
    for (const row of flatLines) {
      qty += row.line.quantity;
      cost += row.line.quantity * row.line.unit_cost;
    }
    return { qty, cost, lineCount: flatLines.length, receiptCount: receipts.length };
  }, [flatLines, receipts.length]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매입 내역</h1>
            <span className="text-caption1 text-[var(--color-label-tertiary)]">
              {summary.receiptCount}건 · {summary.lineCount}라인 · {summary.qty}점 · ₩
              {summary.cost.toLocaleString()}
            </span>
          </div>
          <Link
            href="/admin/inbound"
            className="pressable touch-target rounded-xl bg-[var(--color-fill-tertiary)] px-3 py-2 text-callout font-medium"
          >
            ← 매입 등록
          </Link>
        </header>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="매입처">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.supplier_code ? ` (${s.supplier_code})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="입고일 (시작)">
            <input
              type="date"
              value={dateFrom}
              max={dateTo || todayIso()}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <Field label="입고일 (종료)">
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayIso()}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <Field label="상품 (코드 / 이름 / 컬러 — 비워두면 전체)">
            <input
              type="search"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="비워두면 전체"
              className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        {/* 결과 리스트 — 라인 단위 표시 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : flatLines.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 매입 내역이 없습니다.
            </p>
          ) : (
            <div className="data-list-scroll">
              <table className="data-list-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>매입처</th>
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
                      <tr
                        key={line.id}
                        onClick={() => setEditing(receipt)}
                        title="클릭하여 전표 편집"
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="num" style={{ textAlign: 'left' }}>
                          {receipt.document_at.slice(0, 10)}
                        </td>
                        <td>{receipt.supplier?.name ?? '직매입'}</td>
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
                    <td colSpan={7}>합계</td>
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

      {editing && (
        <EditReceiptDialog
          receipt={editing}
          suppliers={suppliers}
          onClose={handleClose}
          onSaved={handleSaved}
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
