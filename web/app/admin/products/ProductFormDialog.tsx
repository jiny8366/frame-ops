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
  formatColor,
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

  // 카테고리 편집 (선택된 카테고리의 label/code 수정)
  const [editingCategory, setEditingCategory] = useState(false);
  const [editCategoryLabel, setEditCategoryLabel] = useState('');

  // 대기 등록 리스트 (create 모드에서 [추가] 클릭 시 누적, [저장] 시 일괄 POST)
  interface PendingProduct {
    brand_id: string;
    brand_name: string;
    product_line: string;
    category: string;
    style_code: string;
    color_code: string;
    cost_price: number;
    suggested_retail: number;
    sale_price: number;
    code_preview: string;
  }
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [editCategoryCode, setEditCategoryCode] = useState('');

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

  const handleAddCategory = useCallback(async () => {
    const label = newCategoryLabel.trim();
    const code = normalizeShortCode(newCategoryCode || label);
    if (!label) return;
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

  const openEditCategory = useCallback(() => {
    if (!categoryRow) {
      toast.error('편집할 카테고리를 먼저 선택하세요.');
      return;
    }
    setEditCategoryLabel(categoryRow.label);
    setEditCategoryCode(categoryRow.code ?? '');
    setShowAddCategory(false);
    setEditingCategory(true);
  }, [categoryRow]);

  const handleUpdateCategory = useCallback(async () => {
    if (!categoryRow) return;
    const label = editCategoryLabel.trim();
    if (!label) {
      toast.error('이름이 필요합니다.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/categories/${categoryRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, code: editCategoryCode || null }),
      });
      const json = (await res.json()) as { data: CategoryRow | null; error: string | null };
      if (!res.ok || json.error || !json.data) {
        toast.error(json.error ?? '카테고리 수정 실패');
        return;
      }
      await mutateCategories();
      setCategory(json.data.label);
      setEditingCategory(false);
      toast.success(`카테고리 수정: ${json.data.label} (${json.data.code ?? '-'})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류');
    }
  }, [categoryRow, editCategoryLabel, editCategoryCode, mutateCategories]);

  const handleDeleteCategory = useCallback(async () => {
    if (!categoryRow) return;
    if (!confirm(`'${categoryRow.label}' 카테고리를 삭제할까요?\n사용 중인 상품이 있으면 삭제되지 않습니다.`)) return;
    try {
      const res = await fetch(`/api/admin/categories/${categoryRow.id}`, {
        method: 'DELETE',
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '카테고리 삭제 실패');
        return;
      }
      await mutateCategories();
      setCategory('');
      setEditingCategory(false);
      toast.success('카테고리 삭제 완료');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '네트워크 오류');
    }
  }, [categoryRow, mutateCategories]);

  // 현재 폼 → PendingProduct 변환 (검증 포함)
  const snapshotCurrent = useCallback((): PendingProduct | null => {
    if (!brandId || !category || !styleCode.trim() || !colorCode.trim()) return null;
    return {
      brand_id: brandId,
      brand_name: brand?.name ?? '',
      product_line: productLine,
      category,
      style_code: styleCode.trim(),
      color_code: colorCode.trim(),
      cost_price: costPrice,
      suggested_retail: suggestedRetail,
      sale_price: salePrice,
      code_preview: codePreview,
    };
  }, [brandId, brand, productLine, category, styleCode, colorCode, costPrice, suggestedRetail, salePrice, codePreview]);

  // [추가] — 현재 폼을 pending 에 누적. 헤더 입력은 그대로 유지 (유사상품 빠른 입력).
  // 중복 방지: 같은 브랜드+제품번호+컬러 조합은 거부.
  const handleAddPending = useCallback(() => {
    if (mode !== 'create') return;
    const item = snapshotCurrent();
    if (!item) {
      toast.error('브랜드 / 카테고리 / 제품번호 / 컬러 모두 입력하세요.');
      return;
    }
    const dupInPending = pending.some(
      (p) =>
        p.brand_id === item.brand_id &&
        p.style_code === item.style_code &&
        p.color_code === item.color_code
    );
    if (dupInPending) {
      toast.error('대기 목록에 이미 같은 조합이 있습니다.');
      return;
    }
    setPending((prev) => [...prev, item]);
    toast.success(`추가됨: ${item.style_code}/${item.color_code} (${pending.length + 1}건 대기)`);
    // 컬러 코드만 비워서 같은 제품번호의 다른 컬러 빠르게 입력 가능하도록 함.
    setColorCode('');
  }, [mode, snapshotCurrent, pending]);

  const handleRemovePending = useCallback((idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      try {
        if (mode === 'create') {
          // 대기 목록 + 현재 폼(있으면) 합침
          const items: PendingProduct[] = [...pending];
          const current = snapshotCurrent();
          if (current) {
            const dup = items.some(
              (p) =>
                p.brand_id === current.brand_id &&
                p.style_code === current.style_code &&
                p.color_code === current.color_code
            );
            if (!dup) items.push(current);
          }
          if (items.length === 0) {
            setError('등록할 상품이 없습니다. 폼을 채우거나 [추가]로 항목을 누적하세요.');
            setSubmitting(false);
            return;
          }
          const failed: string[] = [];
          for (const item of items) {
            const res = await fetch('/api/admin/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brand_id: item.brand_id,
                product_line: item.product_line,
                category: item.category,
                style_code: item.style_code,
                color_code: item.color_code,
                cost_price: item.cost_price,
                suggested_retail: item.suggested_retail,
                sale_price: item.sale_price,
              }),
            });
            const json = (await res.json()) as { data: unknown; error: string | null };
            if (!res.ok || json.error) {
              failed.push(`${item.style_code}/${item.color_code}: ${json.error ?? '실패'}`);
            }
          }
          if (failed.length > 0) {
            setError(`일부 등록 실패 (${failed.length}/${items.length}):\n${failed.join('\n')}`);
            setSubmitting(false);
            return;
          }
          toast.success(`${items.length}건 등록 완료`);
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
    [mode, initial, brandId, productLine, category, styleCode, colorCode, costPrice, suggestedRetail, salePrice, active, submitting, onSaved, pending, snapshotCurrent]
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
                onClick={() => {
                  setEditingCategory(false);
                  setShowAddCategory((v) => !v);
                }}
                className="pressable rounded-lg px-2 text-callout font-bold bg-[var(--color-fill-tertiary)]"
                aria-label="카테고리 추가"
              >
                +
              </button>
              <button
                type="button"
                onClick={openEditCategory}
                disabled={!categoryRow}
                className="pressable rounded-lg px-2 text-callout bg-[var(--color-fill-tertiary)] disabled:opacity-40"
                aria-label="선택한 카테고리 편집"
                title="선택한 카테고리 편집"
              >
                ✎
              </button>
            </div>
          </Field>
        </div>

        {showAddCategory && (
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
              placeholder="약자 (영문3자, 예: NYL)"
              maxLength={3}
              autoCapitalize="characters"
              pattern="[A-Z]{3}"
              className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="pressable rounded-lg bg-[var(--color-system-blue)] px-3 py-2 text-white text-caption1 font-semibold"
            >
              저장
            </button>
          </div>
        )}

        {editingCategory && categoryRow && (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={editCategoryLabel}
              onChange={(e) => setEditCategoryLabel(e.target.value)}
              placeholder="이름"
              className="flex-1 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
            <input
              type="text"
              value={editCategoryCode}
              onChange={(e) => setEditCategoryCode(e.target.value.toUpperCase())}
              placeholder="약자"
              maxLength={3}
              autoCapitalize="characters"
              pattern="[A-Z]{3}"
              className="w-32 rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
            />
            <button
              type="button"
              onClick={handleUpdateCategory}
              className="pressable rounded-lg bg-[var(--color-system-blue)] px-3 py-2 text-white text-caption1 font-semibold"
            >
              저장
            </button>
            <button
              type="button"
              onClick={handleDeleteCategory}
              className="pressable rounded-lg bg-[var(--color-system-red,#FF3B30)] px-3 py-2 text-white text-caption1 font-semibold"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => setEditingCategory(false)}
              className="pressable rounded-lg bg-[var(--color-fill-tertiary)] px-3 py-2 text-caption1"
            >
              취소
            </button>
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
          <Field label="컬러 ('C' 제외, 표시 시 'C_' 자동 부착)">
            <input
              type="text"
              value={colorCode}
              onChange={(e) => {
                let v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                // 사용자가 'C' 또는 'C_' 입력 시 즉시 제거 (표시는 'C_' 자동 부착)
                if (/^C[A-Z0-9]/.test(v)) v = v.slice(1);
                setColorCode(v);
              }}
              onBlur={(e) => setColorCode(normalizeColorCode(e.target.value))}
              required
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="characters"
              inputMode="text"
              lang="en"
              placeholder="01 / BK / BLK (C 제외)"
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

        {/* [추가] — 폼 바로 아래. 현재 폼 내용을 등록 대기 리스트에 누적. 헤더는 유지(컬러만 비움). */}
        {mode === 'create' && (
          <button
            type="button"
            onClick={handleAddPending}
            disabled={submitting || !brandId || !category || !styleCode.trim() || !colorCode.trim()}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-tertiary)] text-[var(--color-label-primary)] font-semibold disabled:opacity-40"
          >
            + 대기 목록에 추가
          </button>
        )}

        {/* 대기 목록 — create 모드 전용. [추가] 누른 항목이 누적되어 [저장] 시 일괄 등록. */}
        {mode === 'create' && pending.length > 0 && (
          <div className="rounded-lg border border-[var(--color-separator-opaque)] overflow-hidden">
            <div className="bg-[var(--color-fill-quaternary)] px-3 py-2 text-caption1 text-[var(--color-label-secondary)] flex items-center justify-between">
              <span>등록 대기 ({pending.length}건)</span>
              <button
                type="button"
                onClick={() => setPending([])}
                disabled={submitting}
                className="pressable text-caption2 text-[var(--color-system-red)]"
              >
                전체 비우기
              </button>
            </div>
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
                  {pending.map((p, idx) => (
                    <tr key={`${p.brand_id}-${p.style_code}-${p.color_code}`}>
                      <td>
                        {LINE_LABELS[p.product_line as keyof typeof LINE_LABELS] ?? p.product_line?.toUpperCase() ?? '—'}
                      </td>
                      <td>{p.category}</td>
                      <td>{p.brand_name || '—'}</td>
                      <td className="code">{p.style_code}</td>
                      <td className="code">{formatColor(p.color_code)}</td>
                      <td className="num">₩{p.cost_price.toLocaleString()}</td>
                      <td className="num">₩{p.suggested_retail.toLocaleString()}</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        ₩{p.sale_price.toLocaleString()}
                      </td>
                      <td className="num">
                        <button
                          type="button"
                          onClick={() => handleRemovePending(idx)}
                          disabled={submitting}
                          className="pressable text-[var(--color-system-red)]"
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center whitespace-pre-line">{error}</p>
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
            disabled={
              submitting ||
              (mode === 'create'
                ? pending.length === 0 &&
                  (!brandId || !category || !styleCode.trim() || !colorCode.trim())
                : !brandId || !category || !styleCode.trim() || !colorCode.trim())
            }
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            {submitting
              ? '저장 중…'
              : mode === 'create' && pending.length > 0
              ? `저장 (${pending.length + (snapshotCurrent() ? 1 : 0)}건)`
              : '저장'}
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
