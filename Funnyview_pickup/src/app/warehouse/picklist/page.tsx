'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatRx } from '@/lib/utils/format';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  storeName: string;
  itemCount: number;
  acceptedAt: string | null;
  pickingAt: string | null;
}

interface PickItem {
  id: string;
  eyeSide: 'left' | 'right' | 'both';
  quantity: number;
  lensName: string;
  lensBrand: string;
  sphere: string;
  cylinder: string | null;
  axis: number | null;
  addPower: string | null;
  skuSnapshot: string;
}

interface PicklistData {
  generatedAt: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    storeName: string;
    storePhone: string;
    storeAddress: string | null;
    customerName: string;
    customerPhone: string;
    items: PickItem[];
  }>;
  skuTotals: Array<{
    sku: string;
    lensName: string;
    lensBrand: string;
    quantity: number;
  }>;
}

export default function WarehousePicklistPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picklist, setPicklist] = useState<PicklistData | null>(null);

  useEffect(() => {
    fetch('/api/warehouse/orders?status=accepted,picking')
      .then((r) => r.json())
      .then((j) => setOrders(j.orders ?? []));
  }, []);

  async function generate() {
    if (selected.size === 0) return;
    const res = await fetch('/api/warehouse/picklist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderIds: Array.from(selected) }),
    });
    if (res.ok) setPicklist(await res.json());
  }

  function printPage() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">픽리스트</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={generate} disabled={selected.size === 0}>
            픽리스트 생성 ({selected.size})
          </Button>
          {picklist && (
            <Button onClick={printPage} className="bg-emerald-600 hover:bg-emerald-700">
              인쇄
            </Button>
          )}
        </div>
      </header>

      {!picklist ? (
        <section className="space-y-3 print:hidden">
          <p className="text-sm text-gray-500">
            주문을 선택해 픽리스트를 생성하세요. 접수/패킹 중 주문이 대상입니다.
          </p>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">주문번호</th>
                  <th className="px-3 py-2 text-left">고객</th>
                  <th className="px-3 py-2 text-left">픽업가맹점</th>
                  <th className="px-3 py-2 text-right">아이템</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => {
                          const n = new Set(selected);
                          n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-3 py-2">{o.customerName}</td>
                    <td className="px-3 py-2">{o.storeName}</td>
                    <td className="px-3 py-2 text-right">{o.itemCount}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                      대상 주문 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          <header className="border-b pb-3">
            <h2 className="text-xl font-bold">픽리스트</h2>
            <p className="text-xs text-gray-500">
              생성: {formatDateTime(picklist.generatedAt)} · 총 {picklist.orders.length}개 주문
            </p>
          </header>

          <section>
            <h3 className="mb-2 text-sm font-semibold">SKU 합산 (피킹)</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">렌즈</th>
                  <th className="px-3 py-2 text-right">총 수량</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {picklist.skuTotals.map((t) => (
                  <tr key={t.sku}>
                    <td className="px-3 py-2 font-mono text-xs">{t.sku}</td>
                    <td className="px-3 py-2">
                      {t.lensBrand} {t.lensName}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{t.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">주문별 상세 (팩킹)</h3>
            <div className="space-y-4">
              {picklist.orders.map((o) => (
                <div key={o.id} className="break-inside-avoid rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-baseline justify-between border-b pb-2">
                    <div>
                      <div className="font-mono text-xs text-gray-500">{o.orderNumber}</div>
                      <div className="font-semibold">{o.storeName}</div>
                      <div className="text-xs text-gray-500">→ {o.customerName} ({o.customerPhone})</div>
                    </div>
                  </div>
                  <ul className="mt-2 divide-y divide-gray-100 text-sm">
                    {o.items.map((it) => (
                      <li key={it.id} className="py-2">
                        <div className="font-medium">
                          {it.lensBrand} {it.lensName} ·{' '}
                          <span className="text-gray-600">
                            {it.eyeSide === 'left' ? 'OS' : it.eyeSide === 'right' ? 'OD' : '양안'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatRx(it)} · {it.quantity}박스 · SKU {it.skuSnapshot}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </section>
      )}
    </div>
  );
}
