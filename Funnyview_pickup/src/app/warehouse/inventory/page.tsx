'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRx } from '@/lib/utils/format';

interface InvRow {
  inventoryId: string;
  variantId: string;
  sku: string;
  brand: string;
  lensName: string;
  sphere: string;
  cylinder: string | null;
  axis: number | null;
  addPower: string | null;
  onHand: number;
  reserved: number;
  available: number;
  safetyStock: number;
  reorderPoint: number;
  isLow: boolean;
}

export default function WarehouseInventoryPage() {
  return (
    <Suspense fallback={null}>
      <WarehouseInventoryInner />
    </Suspense>
  );
}

function WarehouseInventoryInner() {
  const params = useSearchParams();
  const lowOnly = params.get('low') === '1';
  const [rows, setRows] = useState<InvRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [delta, setDelta] = useState('');

  const load = useCallback(async () => {
    const url = '/api/warehouse/inventory' + (lowOnly ? '?low=1' : '');
    const res = await fetch(url);
    const j = await res.json();
    setRows(j.inventory ?? []);
  }, [lowOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function adjust(variantId: string) {
    const n = Number(delta);
    if (!Number.isInteger(n) || n === 0) return;
    await fetch('/api/warehouse/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ variantId, delta: n, note: n > 0 ? '입고' : '재고조정' }),
    });
    setEditing(null);
    setDelta('');
    load();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          재고 관리 {lowOnly && <span className="text-sm text-red-600">(저재고만)</span>}
        </h1>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">렌즈</th>
              <th className="px-3 py-2 text-left">도수</th>
              <th className="px-3 py-2 text-right">현재고</th>
              <th className="px-3 py-2 text-right">예약</th>
              <th className="px-3 py-2 text-right">가용</th>
              <th className="px-3 py-2 text-right">안전</th>
              <th className="px-3 py-2 text-right">입고/조정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows?.map((r) => (
              <tr key={r.variantId} className={r.isLow ? 'bg-red-50' : ''}>
                <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                <td className="px-3 py-2">
                  {r.brand} {r.lensName}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {formatRx(r)}
                </td>
                <td className="px-3 py-2 text-right">{r.onHand}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r.reserved}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.isLow ? 'text-red-700' : ''}`}>
                  {r.available}
                </td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">{r.safetyStock}</td>
                <td className="px-3 py-2 text-right">
                  {editing === r.variantId ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        className="w-20"
                        value={delta}
                        onChange={(e) => setDelta(e.target.value.replace(/[^\-0-9]/g, ''))}
                        inputMode="numeric"
                      />
                      <Button size="sm" onClick={() => adjust(r.variantId)}>
                        적용
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        취소
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => setEditing(r.variantId)}>
                      변경
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
