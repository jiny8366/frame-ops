'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime, formatKRW } from '@/lib/utils/format';
import type { OrderStatus } from '@/types/order';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  shippedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  storeName: string;
  storePhone: string;
  itemCount: number;
}

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    fetch('/api/orders')
      .then((r) => r.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">내 주문</h1>

      {orders === null ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          불러오는 중...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
          주문 내역이 없습니다.{' '}
          <Link href="/customer/order" className="text-brand-600 hover:underline">
            지금 주문하기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/customer/orders/${o.id}`}
                className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">{o.orderNumber}</div>
                    <div className="mt-0.5 font-semibold">{o.storeName}</div>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>주문일시: {formatDateTime(o.createdAt)}</div>
                  <div className="text-right">{formatKRW(o.total)}</div>
                  {o.shippedAt && <div>출고: {formatDateTime(o.shippedAt)}</div>}
                  {o.readyAt && <div>도착: {formatDateTime(o.readyAt)}</div>}
                  {o.completedAt && (
                    <div className="text-right">완료: {formatDateTime(o.completedAt)}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
