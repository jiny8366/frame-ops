'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Summary {
  shipped: number;
  arrived: number;
  ready: number;
  completedToday: number;
}

export default function StoreDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    async function load() {
      const [shipped, arrived, ready, completed] = await Promise.all([
        fetch('/api/store/orders?status=shipped').then((r) => r.json()),
        fetch('/api/store/orders?status=arrived').then((r) => r.json()),
        fetch('/api/store/orders?status=ready').then((r) => r.json()),
        fetch('/api/store/orders?status=completed').then((r) => r.json()),
      ]);
      const today = new Date().toDateString();
      const completedToday = (completed.orders ?? []).filter((o: { completedAt: string | null }) =>
        o.completedAt ? new Date(o.completedAt).toDateString() === today : false,
      ).length;
      setSummary({
        shipped: shipped.orders?.length ?? 0,
        arrived: arrived.orders?.length ?? 0,
        ready: ready.orders?.length ?? 0,
        completedToday,
      });
    }
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">픽업가맹점 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          입고 예정 · 픽업 대기 · 매장 결제 및 처리완료
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DashCard label="배송 중" value={summary?.shipped} href="/store/incoming" accent="text-emerald-700" />
        <DashCard label="입고 완료" value={summary?.arrived} href="/store/pickup" accent="text-amber-700" />
        <DashCard label="픽업 대기" value={summary?.ready} href="/store/pickup" accent="text-orange-700" />
        <DashCard label="금일 완료" value={summary?.completedToday} href="/store/pickup?status=completed" accent="text-green-700" />
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link href="/store/incoming" className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-amber-500">
          <h3 className="font-semibold">입고 확인</h3>
          <p className="mt-1 text-sm text-gray-500">배송 중 주문 → 입고 처리 → 도착알림 발송</p>
        </Link>
        <Link href="/store/pickup" className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-amber-500">
          <h3 className="font-semibold">픽업 처리</h3>
          <p className="mt-1 text-sm text-gray-500">고객 방문 · 결제 · 처리완료</p>
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
    <Link href={href} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-amber-500">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value ?? '—'}</p>
    </Link>
  );
}
