'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  paid: number;
  accepted: number;
  picking: number;
  shipped: number;
  lowStock: number;
}

export default function WarehouseDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    async function load() {
      const [paidR, acceptedR, pickingR, shippedR, lowR] = await Promise.all([
        fetch('/api/warehouse/orders?status=paid').then((r) => r.json()),
        fetch('/api/warehouse/orders?status=accepted').then((r) => r.json()),
        fetch('/api/warehouse/orders?status=picking').then((r) => r.json()),
        fetch('/api/warehouse/orders?status=shipped').then((r) => r.json()),
        fetch('/api/warehouse/inventory?low=1').then((r) => r.json()),
      ]);
      setSummary({
        paid: paidR.orders?.length ?? 0,
        accepted: acceptedR.orders?.length ?? 0,
        picking: pickingR.orders?.length ?? 0,
        shipped: shippedR.orders?.length ?? 0,
        lowStock: lowR.inventory?.length ?? 0,
      });
    }
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">픽업서비스 업체 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          신규 주문 알림 · 픽리스트 출력 · 패킹 및 출고 처리
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DashCard label="신규(결제완료)" value={summary?.paid} href="/warehouse/orders?status=paid" accent="text-blue-700" />
        <DashCard label="접수" value={summary?.accepted} href="/warehouse/orders?status=accepted" accent="text-cyan-700" />
        <DashCard label="패킹 중" value={summary?.picking} href="/warehouse/picklist" accent="text-indigo-700" />
        <DashCard label="출고" value={summary?.shipped} href="/warehouse/shipments" accent="text-emerald-700" />
        <DashCard label="저재고" value={summary?.lowStock} href="/warehouse/inventory?low=1" accent="text-red-700" />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href="/warehouse/orders"
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-emerald-500"
        >
          <h3 className="font-semibold">주문 처리</h3>
          <p className="mt-1 text-sm text-gray-500">신규 주문 접수 → 패킹 시작</p>
        </Link>
        <Link
          href="/warehouse/picklist"
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-emerald-500"
        >
          <h3 className="font-semibold">픽리스트 출력</h3>
          <p className="mt-1 text-sm text-gray-500">묶음 픽리스트 → SKU 합산 → 출고</p>
        </Link>
        <Link
          href="/warehouse/inventory"
          className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-emerald-500"
        >
          <h3 className="font-semibold">재고 관리</h3>
          <p className="mt-1 text-sm text-gray-500">SKU 입고 · 조정 · 안전재고</p>
        </Link>
      </section>
    </div>
  );
}

function DashCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number | undefined;
  href: string;
  accent: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-emerald-500">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value ?? '—'}</p>
    </Link>
  );
}
