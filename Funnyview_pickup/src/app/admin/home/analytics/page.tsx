'use client';

import { useEffect, useState } from 'react';

interface Row {
  sectionId: string;
  kind: string;
  title: string | null;
  isActive: boolean;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
}

export default function AdminHomeAnalyticsPage() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(`/api/admin/home/analytics?days=${days}`)
      .then((r) => r.json())
      .then((j) => setRows(j.sections ?? []));
  }, [days]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">홈 섹션 분석</h1>
        <select
          className="h-9 rounded-lg border border-gray-300 px-2 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={1}>최근 1일</option>
          <option value={7}>최근 7일</option>
          <option value={14}>최근 14일</option>
          <option value={30}>최근 30일</option>
        </select>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">섹션</th>
              <th className="px-3 py-2 text-left">유형</th>
              <th className="px-3 py-2 text-right">노출</th>
              <th className="px-3 py-2 text-right">클릭</th>
              <th className="px-3 py-2 text-right">CTR</th>
              <th className="px-3 py-2 text-right">전환</th>
              <th className="px-3 py-2 text-right">CVR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows?.map((r) => (
              <tr key={r.sectionId} className={r.isActive ? '' : 'opacity-50'}>
                <td className="px-3 py-2">{r.title || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{r.kind}</td>
                <td className="px-3 py-2 text-right">{r.impressions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{r.clicks.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium">{(r.ctr * 100).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right">{r.conversions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium">{(r.cvr * 100).toFixed(2)}%</td>
              </tr>
            ))}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                  데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        지표 정의 — 노출(impression): 섹션이 화면에 40% 이상 보였을 때 1회. 클릭(click): 섹션 내부 링크 클릭.
        전환(conversion): 클릭 이후 주문 생성 (Phase 10 에서 연결 예정).
      </p>
    </div>
  );
}
