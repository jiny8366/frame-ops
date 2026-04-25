// Frame Ops Web — 매장 정보
// 현재 세션 매장의 정보를 표시·수정. store_code 는 변경 불가 (로그인 키).

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';

interface StoreData {
  id: string;
  store_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_reg_no: string | null;
  active: boolean;
  lat: number | null;
  lng: number | null;
  geo_radius_m: number | null;
  geo_required: boolean | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: StoreData | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data;
};

export default function StoreAdminPage() {
  const { data, isLoading, mutate } = useSWR<StoreData | null>('/api/admin/store', fetcher);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [bizNo, setBizNo] = useState('');
  const [lat, setLat] = useState<string>('');
  const [lng, setLng] = useState<string>('');
  const [radius, setRadius] = useState<string>('200');
  const [geoRequired, setGeoRequired] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name ?? '');
      setAddress(data.address ?? '');
      setPhone(data.phone ?? '');
      setBizNo(data.business_reg_no ?? '');
      setLat(data.lat != null ? String(data.lat) : '');
      setLng(data.lng != null ? String(data.lng) : '');
      setRadius(String(data.geo_radius_m ?? 200));
      setGeoRequired(!!data.geo_required);
    }
  }, [data]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setMessage(null);

      try {
        const latNum = lat.trim() === '' ? null : Number(lat);
        const lngNum = lng.trim() === '' ? null : Number(lng);
        const radiusNum = radius.trim() === '' ? null : Number(radius);
        if (latNum != null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)) {
          setMessage({ type: 'err', text: '위도(lat) 는 -90 ~ 90 사이 숫자여야 합니다.' });
          setSubmitting(false);
          return;
        }
        if (lngNum != null && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180)) {
          setMessage({ type: 'err', text: '경도(lng) 는 -180 ~ 180 사이 숫자여야 합니다.' });
          setSubmitting(false);
          return;
        }
        if (radiusNum != null && (Number.isNaN(radiusNum) || radiusNum < 50 || radiusNum > 1000)) {
          setMessage({ type: 'err', text: '반경은 50 ~ 1000m 사이여야 합니다.' });
          setSubmitting(false);
          return;
        }

        const res = await fetch('/api/admin/store', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            address: address || null,
            phone: phone || null,
            business_reg_no: bizNo || null,
            lat: latNum,
            lng: lngNum,
            geo_radius_m: radiusNum,
            geo_required: geoRequired,
          }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          setMessage({ type: 'err', text: json.error ?? '저장 실패' });
        } else {
          setMessage({ type: 'ok', text: '저장 완료' });
          await mutate();
        }
      } catch (err) {
        setMessage({ type: 'err', text: err instanceof Error ? err.message : '네트워크 오류' });
      } finally {
        setSubmitting(false);
      }
    },
    [name, address, phone, bizNo, lat, lng, radius, geoRequired, submitting, mutate]
  );

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 lg:p-6">
      <div className="max-w-[600px] mx-auto flex flex-col gap-4">
        <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">매장 정보</h1>

        {isLoading ? (
          <p className="text-callout text-[var(--color-label-tertiary)] text-center py-12">
            불러오는 중…
          </p>
        ) : !data ? (
          <p className="text-callout text-[var(--color-system-red)] text-center py-12">
            매장 정보를 불러올 수 없습니다.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 rounded-xl bg-[var(--color-bg-secondary)] p-5"
          >
            <Field label="지점 코드 (로그인 키)">
              <input
                type="text"
                value={data.store_code}
                disabled
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-fill-quaternary)] px-3 py-2 text-callout font-mono opacity-70"
              />
              <span className="text-caption2 text-[var(--color-label-tertiary)]">
                변경 불가 — 로그인에 사용됩니다.
              </span>
            </Field>

            <Field label="매장명">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            <Field label="주소">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="전화번호">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                />
              </Field>
              <Field label="사업자등록번호">
                <input
                  type="text"
                  value={bizNo}
                  onChange={(e) => setBizNo(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
                />
              </Field>
            </div>

            {/* ── 출퇴근 위치 정책 ─────────────────────────────────────── */}
            <div className="rounded-lg border border-[var(--color-separator-opaque)] p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-callout font-semibold">출퇴근 위치 검증 (모바일)</span>
                <label className="flex items-center gap-2 text-caption1">
                  <input
                    type="checkbox"
                    checked={geoRequired}
                    onChange={(e) => setGeoRequired(e.target.checked)}
                  />
                  활성
                </label>
              </div>
              <p className="text-caption2 text-[var(--color-label-tertiary)]">
                활성 시: 모바일 사용자가 매장 좌표 반경 안에서만 로그인 가능. 데스크톱 / 본사 사용자는 영향 없음.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="위도 (lat)">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="37.581234"
                    className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
                  />
                </Field>
                <Field label="경도 (lng)">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="126.985678"
                    className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
                  />
                </Field>
                <Field label="반경 (m, 50~1000)">
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    step={10}
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    className="w-full rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
                  />
                </Field>
              </div>
              <p className="text-caption2 text-[var(--color-label-tertiary)]">
                좌표는 Google Maps / Naver 지도에서 매장을 우클릭(또는 길게 누름)하여 복사. GPS 정확도 ±10~50m 고려해 200m 정도 반경 권장.
              </p>
            </div>

            {message && (
              <p
                className={`text-caption1 text-center ${
                  message.type === 'ok'
                    ? 'text-[var(--color-system-green)]'
                    : 'text-[var(--color-system-red)]'
                }`}
              >
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
            >
              {submitting ? '저장 중…' : '저장'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-callout text-[var(--color-label-secondary)]">{label}</span>
      {children}
    </label>
  );
}
