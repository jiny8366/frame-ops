'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { formatDateTime, formatKRW, formatRx } from '@/lib/utils/format';
import type { OrderStatus } from '@/types/order';

interface OrderDetail {
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: number;
    subtotal: number;
    discount: number;
    customerNote: string | null;
    createdAt: string;
    paidAt: string | null;
    shippedAt: string | null;
    arrivedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
  };
  store: {
    id: string;
    name: string;
    phone: string;
    address: string;
    mapLinks: { kakao: string | null; naver: string | null; tmap: string | null };
  };
  items: Array<{
    id: string;
    eyeSide: 'left' | 'right' | 'both';
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    lensName: string;
    lensBrand: string;
    sphere: string;
    cylinder: string | null;
    axis: number | null;
    addPower: string | null;
  }>;
  history: Array<{
    id: string;
    toStatus: OrderStatus;
    changedAt: string;
  }>;
}

export default function CustomerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/orders/${params.id}`);
      if (cancelled) return;
      if (res.ok) {
        const j = await res.json();
        setData(j);
      }
      setLoading(false);
    }
    load();
    // 가벼운 폴링 (5초)
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [params.id]);

  if (loading && !data) {
    return <div className="text-sm text-gray-400">불러오는 중...</div>;
  }
  if (!data) return <div className="text-sm text-red-600">주문을 찾을 수 없습니다</div>;

  const { order, store, items, history } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/customer/orders" className="text-sm text-gray-500 hover:underline">
          ← 주문 목록
        </Link>
        <StatusBadge status={order.status} />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="text-xs text-gray-500">주문번호</div>
        <div className="font-mono text-lg font-bold">{order.orderNumber}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div>주문일시: {formatDateTime(order.createdAt)}</div>
          {order.paidAt && <div>결제완료: {formatDateTime(order.paidAt)}</div>}
          {order.shippedAt && <div>배송 시작: {formatDateTime(order.shippedAt)}</div>}
          {order.arrivedAt && <div>가맹점 입고: {formatDateTime(order.arrivedAt)}</div>}
          {order.readyAt && <div>픽업 준비: {formatDateTime(order.readyAt)}</div>}
          {order.completedAt && <div>처리완료: {formatDateTime(order.completedAt)}</div>}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 font-semibold">픽업 장소</h3>
        <div className="text-sm">
          <div className="font-medium">{store.name}</div>
          <div className="mt-1 text-gray-500">{store.phone}</div>
          <div className="mt-1 text-gray-500">{store.address}</div>
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          {store.mapLinks.kakao && (
            <a href={store.mapLinks.kakao} target="_blank" rel="noreferrer" className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-800">
              카카오맵
            </a>
          )}
          {store.mapLinks.naver && (
            <a href={store.mapLinks.naver} target="_blank" rel="noreferrer" className="rounded-full bg-green-100 px-3 py-1 text-green-800">
              네이버지도
            </a>
          )}
          {store.mapLinks.tmap && (
            <a href={store.mapLinks.tmap} target="_blank" rel="noreferrer" className="rounded-full bg-red-100 px-3 py-1 text-red-800">
              T맵
            </a>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 font-semibold">주문 상품</h3>
        <ul className="divide-y divide-gray-100">
          {items.map((it) => (
            <li key={it.id} className="flex items-start justify-between py-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">
                  {it.lensBrand} ·{' '}
                  <span className="font-medium text-gray-800">
                    {it.eyeSide === 'left' ? '왼쪽 (OS)' : it.eyeSide === 'right' ? '오른쪽 (OD)' : '양안'}
                  </span>
                </div>
                <div className="font-medium">{it.lensName}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {formatRx(it)} · {it.quantity}박스
                </div>
              </div>
              <div className="text-right font-medium">{formatKRW(it.lineTotal)}</div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>상품 합계</span>
            <span>{formatKRW(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>할인</span>
              <span>-{formatKRW(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>결제 금액</span>
            <span>{formatKRW(order.total)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="mb-3 font-semibold">진행 상태</h3>
        <ul className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex items-center gap-3">
              <StatusBadge status={h.toStatus} />
              <span className="text-xs text-gray-500">{formatDateTime(h.changedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
