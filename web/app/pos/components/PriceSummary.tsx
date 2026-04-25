// Frame Ops Phase 2 — 소계/할인/합계 표시

'use client';

import { memo } from 'react';

export interface PriceSummaryProps {
  subtotal: number;
  discount: number;
  total: number;
}

export const PriceSummary = memo(function PriceSummary({
  subtotal,
  discount,
  total,
}: PriceSummaryProps) {
  return (
    <div className="px-4 py-3 rounded-xl bg-[var(--color-bg-secondary)] flex flex-col gap-1">
      <Row label="소계" value={subtotal} />
      {discount > 0 && (
        <Row label="할인" value={-discount} accent="text-[var(--color-system-red)]" />
      )}
      <div className="border-t border-[var(--color-separator-opaque)] mt-1 pt-2 flex items-baseline justify-between">
        <span className="text-callout text-[var(--color-label-secondary)]">합계</span>
        <span className="text-title2 font-bold tabular-nums text-[var(--color-label-primary)]">
          ₩{total.toLocaleString()}
        </span>
      </div>
    </div>
  );
});

const Row = memo(function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-footnote text-[var(--color-label-secondary)]">{label}</span>
      <span className={`text-callout tabular-nums ${accent ?? 'text-[var(--color-label-primary)]'}`}>
        ₩{value.toLocaleString()}
      </span>
    </div>
  );
});
