'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { SectionKind } from '@/lib/home/section-config';

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-gray-700">{label}</div>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-[10px] text-gray-400">{hint}</div>}
    </label>
  );
}

function TextField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full rounded-lg border border-gray-300 p-2 text-sm"
    />
  );
}

function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="font-mono text-xs"
      />
    </div>
  );
}

function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 w-full rounded-lg border border-gray-300 px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// ─────────────────────────────────────────────────────
// 공통 props
// ─────────────────────────────────────────────────────
export interface SectionEditorProps {
  kind: SectionKind;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function SectionEditor(props: SectionEditorProps) {
  switch (props.kind) {
    case 'hero':
      return <HeroEditor {...props} />;
    case 'product_grid':
      return <ProductGridEditor {...props} />;
    case 'category_chips':
      return <CategoryChipsEditor {...props} />;
    case 'banner_strip':
      return <BannerStripEditor {...props} />;
    case 'countdown':
      return <CountdownEditor {...props} />;
    case 'brand_story':
      return <BrandStoryEditor {...props} />;
  }
}

// ─────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────
function HeroEditor({ config, onChange }: SectionEditorProps) {
  const c = config as Record<string, string | undefined>;
  function patch(k: string, v: string | undefined) {
    onChange({ ...config, [k]: v });
  }
  return (
    <div className="space-y-3">
      <Field label="헤드라인">
        <TextField value={c.headline ?? ''} onChange={(v) => patch('headline', v)} />
      </Field>
      <Field label="서브라인">
        <TextField value={c.subline ?? ''} onChange={(v) => patch('subline', v)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="이미지 URL" hint="비디오와 둘 다 있으면 비디오 우선">
          <TextField value={c.imageUrl ?? ''} onChange={(v) => patch('imageUrl', v)} />
        </Field>
        <Field label="비디오 URL">
          <TextField value={c.videoUrl ?? ''} onChange={(v) => patch('videoUrl', v)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="배경 색상">
          <ColorField value={c.bgColor ?? '#2563eb'} onChange={(v) => patch('bgColor', v)} />
        </Field>
        <Field label="글자 색상">
          <ColorField value={c.textColor ?? '#ffffff'} onChange={(v) => patch('textColor', v)} />
        </Field>
      </div>
      <Field label="정렬">
        <SelectField
          value={(c.align as 'left' | 'center') ?? 'left'}
          options={[
            { value: 'left', label: '왼쪽 정렬' },
            { value: 'center', label: '가운데 정렬' },
          ]}
          onChange={(v) => patch('align', v)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 버튼 라벨">
          <TextField value={c.ctaLabel ?? ''} onChange={(v) => patch('ctaLabel', v)} />
        </Field>
        <Field label="CTA 링크">
          <TextField value={c.ctaHref ?? ''} onChange={(v) => patch('ctaHref', v)} placeholder="/customer/order" />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Product Grid
// ─────────────────────────────────────────────────────
function ProductGridEditor({ config, onChange }: SectionEditorProps) {
  const c = config as Record<string, unknown>;
  const [lensList, setLensList] = useState<Array<{ id: string; brand: string; name: string }>>([]);

  useEffect(() => {
    fetch('/api/lenses')
      .then((r) => r.json())
      .then((j) => {
        const items = (j.lenses ?? []) as Array<{ lensId: string; brand: string; name: string }>;
        setLensList(items.map((l) => ({ id: l.lensId, brand: l.brand, name: l.name })));
      });
  }, []);

  function patch(k: string, v: unknown) {
    onChange({ ...config, [k]: v });
  }

  const lensIds = (c.lensIds as string[]) ?? [];

  return (
    <div className="space-y-3">
      <Field label="큐레이션 모드">
        <SelectField
          value={(c.mode as string) ?? 'best'}
          options={[
            { value: 'best', label: '베스트 (총 주문량 기준)' },
            { value: 'trending', label: '트렌딩 (최근 7일 주문량)' },
            { value: 'new', label: '신상품 (등록일 최신순)' },
            { value: 'manual', label: '수동 선택' },
          ]}
          onChange={(v) => patch('mode', v)}
        />
      </Field>

      {c.mode === 'manual' && (
        <Field label="노출할 상품" hint="체크된 순서대로 표시">
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {lensList.map((l) => (
              <label key={l.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={lensIds.includes(l.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...lensIds, l.id]
                      : lensIds.filter((x) => x !== l.id);
                    patch('lensIds', next);
                  }}
                />
                <span className="text-xs text-gray-500">{l.brand}</span> {l.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="표시 개수">
          <NumberField value={(c.limit as number) ?? 4} onChange={(v) => patch('limit', v)} min={1} max={12} />
        </Field>
        <Field label="레이아웃">
          <SelectField
            value={(c.layout as 'grid' | 'carousel') ?? 'grid'}
            options={[
              { value: 'grid', label: '그리드' },
              { value: 'carousel', label: '가로 스크롤' },
            ]}
            onChange={(v) => patch('layout', v)}
          />
        </Field>
        <Field label="가격 표시">
          <SelectField
            value={c.showPrice === false ? 'no' : 'yes'}
            options={[
              { value: 'yes', label: '표시' },
              { value: 'no', label: '숨김' },
            ]}
            onChange={(v) => patch('showPrice', v === 'yes')}
          />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Category Chips
// ─────────────────────────────────────────────────────
function CategoryChipsEditor({ config, onChange }: SectionEditorProps) {
  const items =
    ((config as Record<string, unknown>).items as Array<{
      label: string;
      href: string;
      emoji?: string;
      badge?: string;
    }>) ?? [];

  function updateItem(idx: number, patch: Partial<(typeof items)[number]>) {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...config, items: next });
  }
  function addItem() {
    onChange({ ...config, items: [...items, { label: '', href: '' }] });
  }
  function removeItem(idx: number) {
    onChange({ ...config, items: items.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-gray-200 p-2">
          <input
            className="col-span-1 h-9 rounded border border-gray-200 px-1 text-center"
            placeholder="🏷️"
            value={it.emoji ?? ''}
            onChange={(e) => updateItem(idx, { emoji: e.target.value })}
          />
          <input
            className="col-span-3 h-9 rounded border border-gray-200 px-2 text-sm"
            placeholder="라벨"
            value={it.label}
            onChange={(e) => updateItem(idx, { label: e.target.value })}
          />
          <input
            className="col-span-5 h-9 rounded border border-gray-200 px-2 text-sm font-mono text-xs"
            placeholder="/customer/order?type=..."
            value={it.href}
            onChange={(e) => updateItem(idx, { href: e.target.value })}
          />
          <input
            className="col-span-2 h-9 rounded border border-gray-200 px-2 text-sm"
            placeholder="HOT/NEW"
            value={it.badge ?? ''}
            onChange={(e) => updateItem(idx, { badge: e.target.value || undefined })}
          />
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="col-span-1 rounded bg-red-100 text-xs text-red-700 hover:bg-red-200"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"
      >
        + 칩 추가
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Banner Strip
// ─────────────────────────────────────────────────────
function BannerStripEditor({ config, onChange }: SectionEditorProps) {
  const c = config as Record<string, string | undefined>;
  function patch(k: string, v: string | undefined) {
    onChange({ ...config, [k]: v });
  }
  return (
    <div className="space-y-3">
      <Field label="메시지">
        <TextField value={c.message ?? ''} onChange={(v) => patch('message', v)} />
      </Field>
      <Field label="링크 (선택)">
        <TextField value={c.href ?? ''} onChange={(v) => patch('href', v)} placeholder="/customer/order" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="배경 색상">
          <ColorField value={c.bgColor ?? '#fef3c7'} onChange={(v) => patch('bgColor', v)} />
        </Field>
        <Field label="글자 색상">
          <ColorField value={c.textColor ?? '#92400e'} onChange={(v) => patch('textColor', v)} />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Countdown
// ─────────────────────────────────────────────────────
function CountdownEditor({ config, onChange }: SectionEditorProps) {
  const c = config as Record<string, string | undefined>;
  function patch(k: string, v: string | undefined) {
    onChange({ ...config, [k]: v });
  }
  const endsAtLocal = c.endsAt ? c.endsAt.slice(0, 16) : '';
  return (
    <div className="space-y-3">
      <Field label="헤드라인">
        <TextField value={c.headline ?? ''} onChange={(v) => patch('headline', v)} />
      </Field>
      <Field label="서브라인">
        <TextField value={c.subline ?? ''} onChange={(v) => patch('subline', v)} />
      </Field>
      <Field label="종료 일시">
        <input
          type="datetime-local"
          value={endsAtLocal}
          onChange={(e) => patch('endsAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
          className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="배경 색상">
          <ColorField value={c.bgColor ?? '#0f172a'} onChange={(v) => patch('bgColor', v)} />
        </Field>
        <Field label="글자 색상">
          <ColorField value={c.textColor ?? '#fbbf24'} onChange={(v) => patch('textColor', v)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 라벨">
          <TextField value={c.ctaLabel ?? ''} onChange={(v) => patch('ctaLabel', v)} />
        </Field>
        <Field label="CTA 링크">
          <TextField value={c.ctaHref ?? ''} onChange={(v) => patch('ctaHref', v)} />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Brand Story
// ─────────────────────────────────────────────────────
function BrandStoryEditor({ config, onChange }: SectionEditorProps) {
  const c = config as Record<string, string | undefined>;
  function patch(k: string, v: string | undefined) {
    onChange({ ...config, [k]: v });
  }
  return (
    <div className="space-y-3">
      <Field label="브랜드명">
        <TextField value={c.brand ?? ''} onChange={(v) => patch('brand', v)} />
      </Field>
      <Field label="헤드라인">
        <TextField value={c.headline ?? ''} onChange={(v) => patch('headline', v)} />
      </Field>
      <Field label="본문">
        <TextArea value={c.body ?? ''} onChange={(v) => patch('body', v)} rows={3} />
      </Field>
      <Field label="이미지 URL">
        <TextField value={c.imageUrl ?? ''} onChange={(v) => patch('imageUrl', v)} />
      </Field>
      <Field label="레이아웃">
        <SelectField
          value={(c.layout as 'image-left' | 'image-right' | 'image-top') ?? 'image-right'}
          options={[
            { value: 'image-right', label: '이미지 오른쪽' },
            { value: 'image-left', label: '이미지 왼쪽' },
            { value: 'image-top', label: '이미지 위' },
          ]}
          onChange={(v) => patch('layout', v)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 라벨">
          <TextField value={c.ctaLabel ?? ''} onChange={(v) => patch('ctaLabel', v)} />
        </Field>
        <Field label="CTA 링크">
          <TextField value={c.ctaHref ?? ''} onChange={(v) => patch('ctaHref', v)} />
        </Field>
      </div>
    </div>
  );
}
