'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';

interface ShipmentRow {
  id: string;
  orderNumber: string;
  status: string;
  storeName: string;
  customerName: string;
  shippedAt?: string | null;
}

export default function WarehouseShipmentsPage() {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/warehouse/orders?status=shipped,arrived,ready,completed');
      const j = await res.json();
      setRows(j.orders ?? []);
    }
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">출고 관리</h1>
      <p className="text-sm text-gray-500">
        출고 이후 단계의 주문 추적 (배송 중 · 입고 · 픽업 준비 · 처리완료)
      </p>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">주문번호</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">고객</th>
              <th className="px-3 py-2 text-left">가맹점</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows === null ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">불러오는 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400">출고 이력 없음</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/customer/orders/${r.id}`} className="hover:underline">
                      {r.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">{r.customerName}</td>
                  <td className="px-3 py-2">{r.storeName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
