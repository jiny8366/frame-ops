// Frame Ops Web — 상품 등록/수정 모달
// 정책: 브랜드/제품번호/컬러/라인 → 상품코드 미리보기 자동 생성.
// 신규 등록 시 + 브랜드 / + 카테고리 인라인 추가 가능.

'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';
import {
  buildProductCodeBase,
  displayNameThreePart,
  LINE_FRM,
  LINE_LABELS,
  LINE_SUN,
  normalizeColorCode,
  normalizeProductLine,
  normalizeShortCode,
  normalizeStyleCode,
  yymmFromDate,
} from '@/lib/product-codes';

export interface ProductRow {
  id: string;
  product_code: string;
  barcode: string | null;
  brand_id: string | null;
  brand_name?: string;
  product_line: string | null;
  category: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string;
  cost_price: number;
  suggested_retail: number;
  sale_price: number;
  stock_quantity: number | null;
  status: string;
  created_at: string;
}

interface BrandRow {
  id: string;
  name: string;
  code: string | null;
}

interface CategoryRow {
  id: string;
  label: string;
  code: string | null;
  sort_order: number;
}

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  initial: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const arrayFetcher = async <T,>(url: string): Promise<T[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: T[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

export function ProductFormDialog({ mode, initial, onClose, onSaved }: ProductFormDialogProps) {
  const { data: brands = [] } = useSWR<BrandRow[]>(
    '/api/admin/brands',
    arrayFetcher
  );
  const { data: categories = [], mutate: mutateCategories } = useSWR<CategoryRow[]>(
    '/api/admin/categories',
    arrayFetcher
  );

  const [brandId, setBrandId] = useState<string>(initial?.brand_id ?? '');
  const [productLine, setProductLine] = useState<string>(
    normalizeProductLine(initial?.product_line ?? LINE_FRM)
  );
  const [category, setCategory] = useState<string>(initial?.category ?? '');
  const [styleCode, setStyleCode] = useState<string>(initial?.style_code ?? '');
  const [colorCode, setColorCode] = useState<string>(initial?.color_code ?? '');
  const [costPrice, setCostPrice] = useState<number>(initial?.cost_price ?? 0);
  const [suggestedRetail, setSuggestedRetail] = useState<number>(initial?.suggested_retail ?? 0);
  const [salePrice, setSalePrice] = useState<number>(initial?.sale_price ?? 0);
  const [active, setActive] = useState<boolean>(initial?.status === 'active' || initial == null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryCode, setNewCategoryCode] = useState('');

  // 첫 진입 시 카테고리 디폴트
  useEffect(() => {
    if (!category && categories.length > 0) {
      setCategory(categories[0].label);
    }
  }, [category, categories]);

  // ESC 닫기
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, submitting]);

  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brands, brandId]);
  const categoryRow = useMemo(
    () => categories.find((c) => c.label === category),
    [categories, category]
  );

  // 미리보기: {LINE}_{CAT}/{BRAND}/{YYMM}/{STYLE4}/{COLOR2}
  const codePreview = useMemo(() => {
    if (!brand || !brand.code) return '';
    if (!categoryRow || !categoryRow.code) return '';
    if (!styleCode.trim() || !colorCode.trim()) return '';
    // 수정 모드는 created_at 기준 yymm 유지, 신규는 오늘
    const yymm =
      mode === 'edit' && initial?.created_at
        ? yymmFromDate(new Date(initial.created_at))
        : yymmFromDate();
    return buildProductCodeBase({
      productLine,
      categoryCode: categoryRow.code,
      brandCode: brand.code,
      yymm,
      styleCode,
      colorCode,
    });
  }, [brand, categoryRow, productLine, styleCode, colorCode, mode, initial]);
  const displayPreview = useMemo(() => {
    if (!brand) return '';
    return displayNameThreePart(brand.name, styleCode, colorCode);
  }, [brand, styleCode, colorCode]);

  // [+] 토글: 펼칠 때 현재 선택된 카테고리의 값을 prefill — 사용자가 그대로 [수정]
  // 하거나 내용을 바꿔 [생성] 으로 신규 추가 가능.
  const toggleAddCategory = useCallback(() => {
    setShowAddCategory((prev) => {
      const next = !prev;
      if (next) {
        // 펼치는 시점에 선택된 카테고리 값으로 입력란 채움.
        const selected = categories.find((c) => c.label === category);
        setNewCategoryLabel(selected?.label ?? '');
        setNewCategoryCode(selected?.code ?? '');
      }
      return next;
    });
  }, [categories, category]);

  // [생성] — 신규 카테고리 추가
  const handleCreateCategory = useCallback(async () => {
    const label = newCategoryLabel.trim();
    const code = normalizeShortCode(newCategoryCode || label);
    if (!label) {
      toast.error('이름을 입력하세요.');
      return;
    }
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, code }),
      });
      const json = (await res.json()) as { data: CategoryRow | null; error: string | null };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '카테고리 추가 실패');
        return;
      }
      await mutateCategories();
      setCategory(json.data.label);
      setNewCategoryLabel('');
      setNewCategoryCode('');
      setShowAddCategory(false);
      toast.success(`카테고리 추가: ${json.data.label} (${json.data.code ?? '-'})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류');
    }
  }, [newCategoryLabel, newCategoryCode, mutateCategories]);

  // [수정] — 현재 선택된 카테고리를 갱신 (label/code 변경)
  const handleUpdateCategory = useCallback(async () => {
    const targetId = categoryRow?.id;
    if (!targetId) {
      toast.error('수정할 카테고리가 선택되지 않았습니다.');
      return;
    }
    const label = newCategoryLabel.trim();
    const code = normalizeShortCode(newCategoryCode || label);
    if (!label) {
      toast.error('이름을 입력하세요.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/categories/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, code }),
      });
      const json = (await res.json()) as { data: CategoryRow | null; error: string | null };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '카테고리 수정 실패');
        return;
      }
      await mutateCategories();
      // 라벨이 바뀌면 현재 선택값도 갱신 (드롭다운 동기화)
      setCategory(json.data.label);
      setNewCategoryLabel('');
      setNewCategoryCode('');
      setShowAddCategory(false);
      toast.success(`카테고리 수정: ${json.data.label} (${json.data.code ?? '-'})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류');
    }
  }, [categoryRow, newCategoryLabel, newCategoryCode, mutateCategories]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      try {
        if (mode === 'create') {
          const res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand_id: brandId,
              product_line: productLine,
              category,
              style_code: styleCode.trim(),
              color_code: colorCode.trim(),
              cost_price: costPrice,
              suggested_retail: suggestedRetail,
              sale_price: salePrice,
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
        } else if (initial) {
          const res = await fetch(`/api/admin/products/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand_id: brandId,
              product_line: productLine,
              category,
              style_code: styleCode.trim(),
              color_code: colorCode.trim(),
              cost_price: costPrice,
              suggested_retail: suggestedRetail,
              sale_price: salePrice,
              status: active ? 'active' : 'inactive',
            }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
        }
        // 카탈로그 캐시 무효화
        void globalMutate(
          (key) => typeof key === 'string' && key.startsWith('/api/admin/products')
        );
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [mode, initial, brandId, productLine, category, styleCode, colorCode, costPrice, suggestedRetail, salePrice, active, submitting, onSaved]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[520px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8"
      >
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
          {mode === 'create' ? '신규 상품 등록' : '상품 편집'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="상품 라인">
            <select
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            >
              <option value={LINE_FRM}>{LINE_LABELS[LINE_FRM]} (FRM)</option>
              <option value={LINE_SUN}>{LINE_LABELS[LINE_SUN]} (SUN)</option>
            </select>
          </Field>
          <Field label="카테고리(소재)">
            <div className="flex gap-1">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              >
                <option value="">선택</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label}
                    {c.code ? ` (${c.code})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={toggleAddCategory}
                className="pressable rounded-lg px-2 text-callout font-bold bg-[var(--color-fill-tertiary)]"
                aria-label="카테고리 수정/추가"
              >
                +
              </button>
            </div>
          </Field>
        </div>

        {showAddCategory && (
          <div className="flex flex-col gap-2 rounded-lg bg-[var(--color-fill-quaternary)] p-3">
            <div className="text-caption2 text-[var(--color-label-secondary)]">
              {categoryRow
                ? `선택된 "${categoryRow.label}" 항목의 내용입니다. 변경 후 [수정] — 새 항목이면 [생성]`
                : '신규 카테고리 입력 후 [생성]'}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                placeholder="이름 (예: 나일론)"
                className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
              <input
                type="text"
                value={newCategoryCode}
                onChange={(e) => setNewCategoryCode(e.target.value.toUpperCase())}
                placeholder="약자 (영문3자)"
                maxLength={3}
                autoCapitalize="characters"
                pattern="[A-Z]{3}"
                className="w-28 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
              />
              <button
                type="button"
                onClick={handleUpdateCategory}
                disabled={!categoryRow}
                className="pressable rounded-lg bg-[var(--color-system-orange)] px-3 py-2 text-white text-caption1 font-semibold disabled:opacity-40"
                title={categoryRow ? '선택된 카테고리 정보를 변경합니다' : '드롭다운에서 카테고리 선택 후 사용 가능'}
              >
                수정
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                className="pressable rounded-lg bg-[var(--color-system-blue)] px-3 py-2 text-white text-caption1 font-semibold"
                title="입력한 내용으로 신규 카테고리 추가"
              >
                생성
              </button>
            </div>
          </div>
        )}

        <Field label="브랜드">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          >
            <option value="">선택</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.code ? ` (${b.code})` : ''}
              </option>
            ))}
          </select>
          <span className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
            새 브랜드는 매입처 관리에서 등록합니다.
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="제품번호 (숫자·영문 — 자릿수 자유)">
            <input
              type="text"
              value={styleCode}
              onChange={(e) => setStyleCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
              onBlur={(e) => setStyleCode(normalizeStyleCode(e.target.value))}
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="characters"
              inputMode="text"
              lang="en"
              placeholder="0101 / SP01 / RB2140"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono tracking-wide text-[var(--color-label-primary)] uppercase"
            />
          </Field>
          <Field label="컬러 (숫자·영문 — 자릿수 자유)">
            <input
              type="text"
              value={colorCode}
              onChange={(e) => setColorCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
              onBlur={(e) => setColorCode(normalizeColorCode(e.target.value))}
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="characters"
              inputMode="text"
              lang="en"
              placeholder="01 / BK / BLK"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono tracking-wide text-[var(--color-label-primary)] uppercase"
            />
          </Field>
        </div>

        {/* 미리보기 */}
        {(codePreview || displayPreview) && (
          <div className="rounded-lg bg-[var(--color-fill-quaternary)] p-3 text-caption1">
            <div className="text-[var(--color-label-secondary)]">표시 상품명</div>
            <div className="font-semibold">{displayPreview || '—'}</div>
            <div className="mt-2 text-[var(--color-label-secondary)]">
              {mode === 'edit' ? '상품코드 (수정 시 유지)' : '상품코드 (자동 생성)'}
            </div>
            <div className="font-mono">
              {mode === 'edit' && initial ? initial.product_code : codePreview || '—'}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="매입가">
            <input
              type="number"
              min={0}
              step={1000}
              value={costPrice || ''}
              onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums"
            />
          </Field>
          <Field label="권장소비자가">
            <input
              type="number"
              min={0}
              step={1000}
              value={suggestedRetail || ''}
              onChange={(e) => setSuggestedRetail(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums"
            />
          </Field>
          <Field label="실판매가">
            <input
              type="number"
              min={0}
              step={1000}
              value={salePrice || ''}
              onChange={(e) => setSalePrice(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout text-right tabular-nums"
            />
          </Field>
        </div>

        {mode === 'edit' && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-callout">활성 상태 (체크 해제 시 검색·POS 노출 제외)</span>
          </label>
        )}

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !brandId || !category || !styleCode.trim() || !colorCode.trim()}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
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
