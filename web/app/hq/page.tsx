// Frame Ops Web — 본사 대시보드
// 전 매장 오늘 매출 요약 카드.

'use client';

import useSWR from 'swr';
import Link from 'next/link';

interface StoreItem {
  store_id: string;
  store_code: string;
  store_name: string;
  cash: number;
  card: number;
  revenue: number;
  count: number;
}

interface DashboardResponse {
  today: string;
  total: { cash: number; card: number; revenue: number; count: number };
  stores: StoreItem[];
}

const fetcher = async (url: string): Promise<DashboardResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: DashboardResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

export default function HqHomePage() {
  const { data, isLoading } = useSWR<DashboardResponse>('/api/hq/dashboard', fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            본사 대시보드
          </h1>
          <p className="text-caption1 text-[var(--color-label-tertiary)]">
            오늘 매출 ({data?.today ?? '—'}) · 전 매장 합산 + 매장별
          </p>
        </header>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            데이터 불러오기 실패
          </p>
        ) : (
          <>
            {/* 전체 합산 */}
            <section className="rounded-xl bg-[var(--color-bg-secondary)] p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="총 매출" value={data.total.revenue} large />
              <Stat label="현금" value={data.total.cash} />
              <Stat label="카드" value={data.total.card} />
              <Stat label="건수" value={data.total.count} unit="건" />
            </section>

            {/* 매장별 카드 */}
            <h2 className="text-headline font-semibold mt-2">매장별</h2>
            {data.stores.length === 0 ? (
              <p className="text-callout text-[var(--color-label-tertiary)] py-8 text-center">
                등록된 매장이 없습니다.{' '}
                <Link href="/hq/stores" className="text-[var(--color-system-blue)] underline">
                  매장 추가
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.stores.map((s) => (
                  <article
                    key={s.store_id}
                    className="rounded-xl bg-[var(--color-bg-secondary)] p-4 flex flex-col gap-1"
                  >
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-headline font-semibold truncate">{s.store_name}</h3>
                      <span className="text-caption2 font-mono text-[var(--color-label-tertiary)]">
                        {s.store_code}
                      </span>
                    </div>
                    <div className="text-title3 font-bold tabular-nums">
                      ₩{s.revenue.toLocaleString()}
                    </div>
                    <div className="flex items-baseline gap-3 text-caption1 text-[var(--color-label-secondary)]">
                      <span>현금 ₩{s.cash.toLocaleString()}</span>
                      <span>카드 ₩{s.card.toLocaleString()}</span>
                      <span>{s.count}건</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  unit = '₩',
  large,
}: {
  label: string;
  value: number;
  unit?: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption1 text-[var(--color-label-secondary)]">{label}</span>
      <span className={`tabular-nums ${large ? 'text-title2 font-bold' : 'text-headline font-semibold'}`}>
        {unit === '₩'
          ? `₩${value.toLocaleString()}`
          : `${value.toLocaleString()}${unit}`}
      </span>
    </div>
  );
}
