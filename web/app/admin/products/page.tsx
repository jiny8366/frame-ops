// Frame Ops Web — 상품 등록 (본사)
// 브랜드/제품번호/컬러/라인/카테고리/가격 입력 → 상품코드·표시명 자동 생성.
// 검색·필터 가능한 리스트 + 추가/편집 모달.

'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { ProductFormDialog, type ProductRow } from './ProductFormDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { LINE_FRM, LINE_LABELS, LINE_SUN, formatColor } from '@/lib/product-codes';

const productsFetcher = async (url: string): Promise<ProductRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: ProductRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

interface BrandRow {
  id: string;
  name: string;
}
const brandsFetcher = async (url: string): Promise<BrandRow[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: BrandRow[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export default function ProductsAdminPage() {
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('');
  const [lineFilter, setLineFilter] = useState<string>('');
  const debouncedQuery = useDebounce(query, 250);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set('q', debouncedQuery);
  if (brandFilter) params.set('brand_id', brandFilter);
  if (lineFilter) params.set('line', lineFilter);
  const url = `/api/admin/products${params.toString() ? '?' + params.toString() : ''}`;

  const { data: products = [], isLoading, mutate } = useSWR<ProductRow[]>(url, productsFetcher);
  const { data: brands = [] } = useSWR<BrandRow[]>('/api/admin/brands', brandsFetcher);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);

  const handleAdd = useCallback(() => setCreating(true), []);
  const handleEdit = useCallback((row: ProductRow) => setEditing(row), []);
  const handleClose = useCallback(() => {
    setCreating(false);
    setEditing(null);
  }, []);
  const handleSaved = useCallback(async () => {
    await mutate();
    handleClose();
  }, [mutate, handleClose]);

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">상품 등록</h1>
          <button
            type="button"
            onClick={handleAdd}
            className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] px-4 py-2 text-callout font-semibold text-white"
          >
            + 신규 상품
          </button>
        </header>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="검색 (코드 / 제품명 / 스타일 / 컬러)">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="키워드 입력"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
          <Field label="브랜드">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="상품 라인">
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value="">전체</option>
              <option value={LINE_FRM}>{LINE_LABELS[LINE_FRM]} (FRM)</option>
              <option value={LINE_SUN}>{LINE_LABELS[LINE_SUN]} (SUN)</option>
            </select>
          </Field>
        </div>

        {/* 리스트 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : products.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              조건에 맞는 상품이 없습니다.
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
                    <th className="num">매입가</th>
                    <th className="num">권장소비자가</th>
                    <th className="num">실판매가</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {p.product_line
                          ? LINE_LABELS[p.product_line as keyof typeof LINE_LABELS] ?? p.product_line.toUpperCase()
                          : '—'}
                      </td>
                      <td>{p.category}</td>
                      <td>{p.brand_name ?? '—'}</td>
                      <td className="code">{p.style_code ?? '—'}</td>
                      <td className="code">{formatColor(p.color_code)}</td>
                      <td className="num">₩{(p.cost_price ?? 0).toLocaleString()}</td>
                      <td className="num">₩{(p.suggested_retail ?? 0).toLocaleString()}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        ₩{(p.sale_price ?? 0).toLocaleString()}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          className="pressable text-[var(--color-system-blue)]"
                        >
                          편집
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ProductFormDialog
          mode={creating ? 'create' : 'edit'}
          initial={editing}
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
