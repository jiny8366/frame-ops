// Frame Ops Web — 본사 대시보드
// 30 초마다 자동 갱신. 매장 셀렉터로 전체 또는 단일 매장.
// 모든 데이터: 현재 시점 직전 12시간 (날짜 지정 없음).
// KPI: 매출 / 매입 / 영업이익 / 건수·수량
// 그래프: 직전 12시간 시간대별 매출·수량 라인
// 하단: 판매 상품 (데스크톱 20행 / 모바일 10행 + 스크롤)

'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
}

interface DashboardSummary {
  revenue: number;
  cost: number;
  profit: number;
  sale_count: number;
  item_count: number;
}

interface HourlyPoint {
  hour: number;
  label: string;
  revenue: number;
  qty: number;
}

interface ProductRow {
  product_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  quantity: number;
  revenue: number;
}

interface DashboardResponse {
  store_id: string | null;
  stores: StoreOpt[];
  window_start: string | null;
  window_end: string | null;
  summary: DashboardSummary;
  hourly: HourlyPoint[];
  products: ProductRow[];
}

const fetcher = async (url: string): Promise<DashboardResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: DashboardResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function fmtRange(start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${fmt(s)} ~ ${fmt(e)}`;
}

export default function HqDashboardPage() {
  const [storeId, setStoreId] = useState<string>('');

  const url = `/api/hq/dashboard${storeId ? `?store_id=${storeId}` : ''}`;
  const { data, isLoading } = useSWR<DashboardResponse>(url, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">대시보드</h1>
            <p className="text-caption2 text-[var(--color-label-tertiary)]">
              직전 12시간 ({fmtRange(data?.window_start ?? null, data?.window_end ?? null)}) · 30 초마다 자동 갱신
            </p>
          </div>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-secondary)] px-3 py-2 text-callout"
          >
            <option value="">전체 매장</option>
            {(data?.stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.store_code})
              </option>
            ))}
          </select>
        </header>

        {isLoading && !data ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            데이터 불러오기 실패
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="매출" value={data.summary.revenue} />
              <Kpi label="매입(원가)" value={data.summary.cost} muted />
              <Kpi
                label="영업이익 (매출−매입)"
                value={data.summary.profit}
                color={
                  data.summary.profit >= 0
                    ? 'var(--color-system-green)'
                    : 'var(--color-system-red)'
                }
              />
              <Kpi
                label="건수 / 수량"
                value={`${data.summary.sale_count} / ${data.summary.item_count}`}
                raw
              />
            </section>

            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-4">
              <h2 className="text-headline font-semibold text-[var(--color-label-primary)] mb-3">
                시간대별 매출·수량 (직전 12시간)
              </h2>
              <HourlyChart data={data.hourly} />
            </section>

            <section className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-separator-opaque)]">
                <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
                  판매 상품 ({data.products.length})
                </h2>
                <p className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
                  데스크톱 20개 / 모바일 10개 노출 후 스크롤
                </p>
              </div>
              <ProductsTable products={data.products} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  color,
  muted,
  raw,
}: {
  label: string;
  value: number | string;
  color?: string;
  muted?: boolean;
  raw?: boolean;
}) {
  const display = raw
    ? String(value)
    : typeof value === 'number'
      ? `₩${value.toLocaleString()}`
      : value;
  return (
    <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-1">
      <span className="text-caption1 text-[var(--color-label-secondary)]">{label}</span>
      <span
        className={`tabular-nums text-title3 font-bold ${muted ? 'opacity-70' : ''}`}
        style={color ? { color } : undefined}
      >
        {display}
      </span>
    </div>
  );
}

function HourlyChart({ data }: { data: HourlyPoint[] }) {
  // 누적 곡선 — 12시간 윈도우 시작부터 시간이 지남에 따라 우상향.
  const cumulative = useMemo(() => {
    let r = 0;
    let q = 0;
    return data.map((p) => {
      r += p.revenue;
      q += p.qty;
      return {
        hour: p.label,
        매출: r,
        수량: q,
      };
    });
  }, [data]);

  const formatY = useCallback((v: number) => `${(v / 10000).toFixed(0)}만`, []);
  const formatTooltip = useCallback((value: unknown, name: unknown) => {
    const v = typeof value === 'number' ? value : Number(value) || 0;
    const n = String(name ?? '');
    return n === '매출' ? [`₩${v.toLocaleString()}`, n] : [v, n];
  }, []) as never;

  return (
    <div className="w-full h-[260px] sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cumulative} margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
          <CartesianGrid stroke="var(--color-separator-non-opaque)" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            stroke="var(--color-label-tertiary)"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            yAxisId="rev"
            stroke="var(--color-system-blue)"
            fontSize={11}
            tickLine={false}
            tickFormatter={formatY}
            width={48}
          />
          <YAxis
            yAxisId="qty"
            orientation="right"
            stroke="var(--color-system-orange)"
            fontSize={11}
            tickLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-separator-opaque)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={formatTooltip}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="rev"
            type="monotone"
            dataKey="매출"
            stroke="var(--color-system-blue)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            yAxisId="qty"
            type="monotone"
            dataKey="수량"
            stroke="var(--color-system-orange)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductsTable({ products }: { products: ProductRow[] }) {
  // 데스크톱 20행 ≈ 720px, 모바일 10행 ≈ 360px
  return (
    <div className="overflow-auto max-h-[360px] sm:max-h-[720px]">
      {products.length === 0 ? (
        <p className="text-callout text-[var(--color-label-tertiary)] text-center py-8">
          판매 내역이 없습니다.
        </p>
      ) : (
        <table className="w-full text-callout">
          <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
            <tr>
              <th className="text-left p-3">상품</th>
              <th className="text-right p-3 w-16">수량</th>
              <th className="text-right p-3 w-32">매출</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={p.product_id}
                className="border-t border-[var(--color-separator-opaque)]"
              >
                <td className="p-3">
                  <div className="text-caption2 text-[var(--color-label-secondary)]">
                    {p.brand_name || '—'}
                  </div>
                  <div className="font-semibold">
                    {p.style_code ?? '—'}
                    {p.color_code ? ` / ${p.color_code}` : ''}
                  </div>
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">{p.quantity}</td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  ₩{p.revenue.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
