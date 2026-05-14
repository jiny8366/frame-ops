'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime, formatKRW } from '@/lib/utils/format';
import type { OrderStatus } from '@/types/order';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  paidAt: string | null;
  customerName: string;
  customerPhone: string;
  storeName: string;
  itemCount: number;
}

export default function WarehouseOrdersPage() {
  const params = useSearchParams();
  const statusFilter = params.get('status');
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch('/api/warehouse/orders' + q);
    const json = await res.json();
    setOrders(json.orders ?? []);
  }, [statusFilter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function batch(action: 'accept' | 'pick' | 'ship' | 'cancel') {
    if (selected.size === 0) return;
    setError(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/warehouse/orders/${id}/transition`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        }).then((r) => (r.ok ? null : r.json())),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value));
    if (failed.length > 0) {
      setError(`${failed.length}건 처리 실패`);
    }
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          주문 처리{statusFilter ? ` (${statusFilter})` : ''}
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => batch('accept')} disabled={selected.size === 0}>
            접수
          </Button>
          <Button variant="secondary" size="sm" onClick={() => batch('pick')} disabled={selected.size === 0}>
            패킹 시작
          </Button>
          <Button size="sm" onClick={() => batch('ship')} disabled={selected.size === 0} className="bg-emerald-600 hover:bg-emerald-700">
            출고
          </Button>
          <Button variant="danger" size="sm" onClick={() => batch('cancel')} disabled={selected.size === 0}>
            취소
          </Button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left w-8">
                <input
                  type="checkbox"
                  checked={(orders?.length ?? 0) > 0 && selected.size === (orders?.length ?? 0)}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(orders?.map((o) => o.id) ?? []));
                    else setSelected(new Set());
                  }}
                />
              </th>
              <th className="px-3 py-2 text-left">주문번호</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">고객</th>
              <th className="px-3 py-2 text-left">픽업가맹점</th>
              <th className="px-3 py-2 text-right">금액</th>
              <th className="px-3 py-2 text-right">아이템</th>
              <th className="px-3 py-2 text-left">결제완료</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders?.map((o) => (
              <tr key={o.id} className={selected.has(o.id) ? 'bg-emerald-50' : ''}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                </td>
                <td className="px-3 py-2 font-mono text-xs">{o.orderNumber}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-3 py-2">
                  <div>{o.customerName}</div>
                  <div className="text-xs text-gray-500">{o.customerPhone}</div>
                </td>
                <td className="px-3 py-2">{o.storeName}</td>
                <td className="px-3 py-2 text-right">{formatKRW(o.total)}</td>
                <td className="px-3 py-2 text-right">{o.itemCount}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(o.paidAt)}</td>
              </tr>
            ))}
            {orders && orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-400">
                  처리할 주문이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
