'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
  isPaid: number;
  customerName: string;
  customerPhone: string;
  readyAt: string | null;
  completedAt: string | null;
  itemCount: number;
}

export default function StorePickupPage() {
  const params = useSearchParams();
  const statusParam = params.get('status') ?? 'ready';
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<OrderRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/store/orders?status=' + statusParam);
    const j = await res.json();
    setRows(j.orders ?? []);
  }, [statusParam]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  async function complete(o: OrderRow, payment?: { method: 'card' | 'cash'; amount: number }) {
    setBusy(o.id);
    await fetch(`/api/store/orders/${o.id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete', payment }),
    });
    setBusy(null);
    setPayOpen(null);
    load();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">픽업 처리</h1>
        <div className="flex gap-2 text-xs">
          <FilterTab active={statusParam === 'ready'} href="/store/pickup?status=ready" label="픽업 대기" />
          <FilterTab active={statusParam === 'completed'} href="/store/pickup?status=completed" label="완료" />
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">주문번호</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">고객</th>
              <th className="px-3 py-2 text-right">금액</th>
              <th className="px-3 py-2 text-left">결제</th>
              <th className="px-3 py-2 text-left">시각</th>
              <th className="px-3 py-2 text-right">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/customer/orders/${r.id}`} className="hover:underline">{r.orderNumber}</Link>
                </td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2">
                  <div>{r.customerName}</div>
                  <div className="text-xs text-gray-500">{r.customerPhone}</div>
                </td>
                <td className="px-3 py-2 text-right">{formatKRW(r.total)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.isPaid ? <span className="text-green-700">선결제</span> : <span className="text-gray-500">매장결제</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {r.completedAt ? formatDateTime(r.completedAt) : formatDateTime(r.readyAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === 'ready' && (
                    r.isPaid ? (
                      <Button size="sm" disabled={busy === r.id} onClick={() => complete(r)} className="bg-green-600 hover:bg-green-700">
                        픽업 완료
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setPayOpen(r)} className="bg-amber-600 hover:bg-amber-700">
                        결제 + 완료
                      </Button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">건이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {payOpen && (
        <PaymentDialog order={payOpen} onCancel={() => setPayOpen(null)} onConfirm={(p) => complete(payOpen, p)} />
      )}
    </div>
  );
}

function FilterTab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1 ${active ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
      {label}
    </Link>
  );
}

function PaymentDialog({
  order,
  onCancel,
  onConfirm,
}: {
  order: OrderRow;
  onCancel: () => void;
  onConfirm: (p: { method: 'card' | 'cash'; amount: number }) => void;
}) {
  const [method, setMethod] = useState<'card' | 'cash'>('card');
  const [amount, setAmount] = useState(order.total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold">결제 처리</h3>
        <p className="mt-1 text-sm text-gray-500">{order.orderNumber} · {order.customerName}</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500">결제 수단</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${method === 'card' ? 'border-amber-600 bg-amber-50' : 'border-gray-300'}`}
              >
                카드
              </button>
              <button
                type="button"
                onClick={() => setMethod('cash')}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${method === 'cash' ? 'border-amber-600 bg-amber-50' : 'border-gray-300'}`}
              >
                현금
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">금액</label>
            <input
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value.replace(/\D/g, ''))))}
            />
          </div>
          <div className="mt-2 text-right text-sm text-gray-500">
            주문금액: <span className="font-semibold text-gray-900">{formatKRW(order.total)}</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button onClick={() => onConfirm({ method, amount })} className="bg-amber-600 hover:bg-amber-700">
            결제 + 처리완료
          </Button>
        </div>
      </div>
    </div>
  );
}
