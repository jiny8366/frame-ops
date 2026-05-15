'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import type { OrderStatus } from '@/types/order';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  isPaid: number;
  customerName: string;
  customerPhone: string;
  shippedAt: string | null;
  arrivedAt: string | null;
  itemCount: number;
}

export default function StoreIncomingPage() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/store/orders?status=shipped,arrived');
    const j = await res.json();
    setRows(j.orders ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  async function transition(id: string, action: 'arrive' | 'ready') {
    setBusy(id);
    await fetch(`/api/store/orders/${id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold md:text-2xl">입고 / 배송 중</h1>
      <p className="text-sm text-gray-500">
        픽업서비스 업체에서 출고된 주문. 입고 처리 후 고객에게 도착알림을 보냅니다.
      </p>

      {/* 모바일 카드 */}
      <ul className="space-y-2 md:hidden">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-xs text-gray-500">{r.orderNumber}</div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 font-medium">
              {r.customerName}{' '}
              <a href={`tel:${r.customerPhone}`} className="text-xs text-brand-600">
                {r.customerPhone}
              </a>
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              {r.itemCount}건 · 출고 {formatDateTime(r.shippedAt)}
            </div>
            <div className="mt-2">
              {r.status === 'shipped' && (
                <Button size="sm" disabled={busy === r.id} onClick={() => transition(r.id, 'arrive')} className="w-full">
                  입고 처리
                </Button>
              )}
              {r.status === 'arrived' && (
                <Button
                  size="sm"
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  disabled={busy === r.id}
                  onClick={() => transition(r.id, 'ready')}
                >
                  도착알림 발송
                </Button>
              )}
            </div>
          </li>
        ))}
        {rows && rows.length === 0 && (
          <li className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            대기 중인 주문이 없습니다
          </li>
        )}
      </ul>

      {/* 데스크탑 테이블 */}
      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">주문번호</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">고객</th>
              <th className="px-3 py-2 text-right">아이템</th>
              <th className="px-3 py-2 text-left">출고시각</th>
              <th className="px-3 py-2 text-right">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-xs">{r.orderNumber}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">
                  <div>{r.customerName}</div>
                  <div className="text-xs text-gray-500">{r.customerPhone}</div>
                </td>
                <td className="px-3 py-2 text-right">{r.itemCount}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(r.shippedAt)}</td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'shipped' && (
                    <Button size="sm" disabled={busy === r.id} onClick={() => transition(r.id, 'arrive')}>
                      입고
                    </Button>
                  )}
                  {r.status === 'arrived' && (
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700" disabled={busy === r.id} onClick={() => transition(r.id, 'ready')}>
                      도착알림 발송
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">대기 중인 주문이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
