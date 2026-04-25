// Frame Ops Web — 근태관리 (출퇴근 기록 조회)
// HQ 사용자: 매장 필터 (전체 또는 단일). 지점 사용자: 자기 매장만 자동 표시.

'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface StoreOpt {
  id: string;
  store_code: string;
  name: string;
}

interface EventRow {
  id: string;
  user_id: string;
  store_id: string;
  event: string;
  occurred_at: string;
  lat: number | null;
  lng: number | null;
  distance_m: number | null;
  display_name: string | null;
  login_id: string | null;
  store_name: string | null;
  store_code: string | null;
}

interface AttendanceResponse {
  from: string;
  to: string;
  store_id: string | null;
  stores: StoreOpt[];
  is_hq: boolean;
  events: EventRow[];
}

const fetcher = async (url: string): Promise<AttendanceResponse> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: AttendanceResponse | null; error: string | null };
  if (json.error || !json.data) throw new Error(json.error ?? '응답 없음');
  return json.data;
};

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AttendancePage() {
  const [storeId, setStoreId] = useState<string>('');
  const [from, setFrom] = useState<string>(todayDate());
  const [to, setTo] = useState<string>(todayDate());

  const url = `/api/admin/attendance?from=${from}&to=${to}${storeId ? `&store_id=${storeId}` : ''}`;
  const { data, isLoading } = useSWR<AttendanceResponse>(url, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            근태관리 (출퇴근)
          </h1>
          <p className="text-caption2 text-[var(--color-label-tertiary)] mt-0.5">
            모바일 로그인·로그아웃이 출근·퇴근으로 자동 기록됩니다.
          </p>
        </header>

        {/* 필터 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="시작일">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value || todayDate())}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          <Field label="종료일">
            <input
              type="date"
              value={to}
              min={from}
              max={todayDate()}
              onChange={(e) => setTo(e.target.value || todayDate())}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
            />
          </Field>
          {data?.is_hq && (
            <Field label="매장">
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              >
                <option value="">전체 매장</option>
                {data.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.store_code})
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* 결과 */}
        <div className="rounded-xl bg-[var(--color-bg-secondary)] overflow-hidden">
          {isLoading && !data ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              불러오는 중…
            </p>
          ) : !data || data.events.length === 0 ? (
            <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
              기간 내 출퇴근 기록이 없습니다.
            </p>
          ) : (
            <div className="overflow-auto max-h-[640px]">
              <table className="w-full text-callout">
                <thead className="bg-[var(--color-fill-quaternary)] text-caption1 text-[var(--color-label-secondary)] sticky top-0">
                  <tr>
                    <th className="text-left p-3 whitespace-nowrap">일시</th>
                    <th className="text-left p-3">직원이름</th>
                    <th className="text-left p-3">매장명</th>
                    <th className="text-left p-3 w-20">구분</th>
                    <th className="text-left p-3 w-24">위치정보</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t border-[var(--color-separator-opaque)]"
                    >
                      <td className="p-3 text-caption1 tabular-nums whitespace-nowrap">
                        {fmtDateTime(e.occurred_at)}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{e.display_name ?? '—'}</div>
                        <div className="text-caption2 text-[var(--color-label-tertiary)] font-mono">
                          {e.login_id ?? ''}
                        </div>
                      </td>
                      <td className="p-3 text-caption1">
                        {e.store_name ?? '—'}{' '}
                        <span className="text-[var(--color-label-tertiary)] font-mono">
                          {e.store_code ?? ''}
                        </span>
                      </td>
                      <td className="p-3">
                        <EventBadge event={e.event} />
                      </td>
                      <td className="p-3 text-caption1">
                        <GeoBadge applied={e.distance_m != null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption1 text-[var(--color-label-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function EventBadge({ event }: { event: string }) {
  const isIn = event === 'clock_in';
  const c = isIn ? 'var(--color-system-green)' : 'var(--color-system-orange)';
  const label = isIn ? '출근' : '퇴근';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-caption2 font-medium"
      style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)` }}
    >
      {label}
    </span>
  );
}

function GeoBadge({ applied }: { applied: boolean }) {
  const c = applied ? 'var(--color-system-blue)' : 'var(--color-label-tertiary)';
  const label = applied ? '적용' : '미적용';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-caption2 font-medium"
      style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 15%, transparent)` }}
    >
      {label}
    </span>
  );
}
