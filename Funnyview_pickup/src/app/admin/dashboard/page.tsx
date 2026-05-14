'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatKRW } from '@/lib/utils/format';

interface DashboardData {
  days: number;
  kpi: {
    orderCount: number;
    completedCount: number;
    grossRevenue: number;
    avgOrder: number;
    cogs: number;
    grossProfit: number;
  };
  daily: Array<{ date: string; revenue: number; orderCount: number }>;
  stores: Array<{
    storeId: string;
    storeName: string;
    commissionRate: string;
    orderCount: number;
    netRevenue: number;
    commission: number;
  }>;
  referral: {
    totalRewards: number;
    rewardCount: number;
    uniqueReferrers: number;
  };
  paymentBreakdown: Array<{
    venue: string;
    method: string;
    count: number;
    amount: number;
  }>;
}

const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function AdminDashboardPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch(`/api/admin/dashboard?days=${days}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [days]);

  if (!data) {
    return <div className="text-sm text-gray-400">불러오는 중...</div>;
  }

  const conversionRate =
    data.kpi.orderCount > 0
      ? ((data.kpi.completedCount / data.kpi.orderCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">운영 대시보드</h1>
        <select
          className="h-9 rounded-lg border border-gray-300 px-2 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </select>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="총 주문" value={data.kpi.orderCount.toLocaleString()} suffix="건" />
        <KpiCard
          label="완료 주문"
          value={data.kpi.completedCount.toLocaleString()}
          suffix="건"
          hint={`완료율 ${conversionRate}%`}
        />
        <KpiCard label="매출" value={formatKRW(data.kpi.grossRevenue)} />
        <KpiCard label="평균 객단가" value={formatKRW(data.kpi.avgOrder)} />
        <KpiCard label="영업이익" value={formatKRW(data.kpi.grossProfit)} hint={`원가 ${formatKRW(data.kpi.cogs)}`} />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">일별 매출 추이</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v, n) =>
                  n === 'revenue' ? formatKRW(v as number) : `${v} 건`
                }
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" name="매출" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orderCount" name="주문수" stroke="#10b981" strokeWidth={2} dot={false} yAxisId={0} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">가맹점 매출 TOP</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={data.stores} layout="vertical" margin={{ top: 0, right: 10, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="storeName" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v) => formatKRW(v as number)} />
                <Bar dataKey="netRevenue" name="순매출" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">결제 수단 분포</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.paymentBreakdown}
                  dataKey="amount"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(p: { method?: string; venue?: string }) =>
                    `${p.method ?? ''}·${p.venue ?? ''}`
                  }
                  labelLine={false}
                >
                  {data.paymentBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatKRW(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">가맹점 정산</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">가맹점</th>
                <th className="px-3 py-2 text-right">주문</th>
                <th className="px-3 py-2 text-right">순매출</th>
                <th className="px-3 py-2 text-right">수수료율</th>
                <th className="px-3 py-2 text-right">지급액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.stores.map((s) => (
                <tr key={s.storeId}>
                  <td className="px-3 py-2 font-medium">{s.storeName}</td>
                  <td className="px-3 py-2 text-right">{s.orderCount}건</td>
                  <td className="px-3 py-2 text-right">{formatKRW(s.netRevenue)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{s.commissionRate}%</td>
                  <td className="px-3 py-2 text-right font-semibold text-brand-700">{formatKRW(s.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">추천인 리워드</h2>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="적립 누계" value={formatKRW(data.referral.totalRewards)} />
          <KpiCard label="적립 건수" value={data.referral.rewardCount.toLocaleString()} suffix="건" />
          <KpiCard
            label="추천 활동 유저"
            value={data.referral.uniqueReferrers.toLocaleString()}
            suffix="명"
          />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold">
        {value}
        {suffix && <span className="ml-1 text-sm font-medium text-gray-500">{suffix}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-gray-400">{hint}</div>}
    </div>
  );
}
