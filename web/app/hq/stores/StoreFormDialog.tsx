// Frame Ops Web — HQ 매장 등록/편집 모달

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

export interface StoreRow {
  id: string;
  store_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  business_reg_no: string | null;
  active: boolean;
  lat?: number | null;
  lng?: number | null;
  geo_radius_m?: number | null;
  geo_required?: boolean | null;
  created_at?: string;
}

interface Props {
  mode: 'create' | 'edit';
  initial: StoreRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function StoreFormDialog({ mode, initial, onClose, onSaved }: Props) {
  const [storeCode, setStoreCode] = useState(initial?.store_code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [bizNo, setBizNo] = useState(initial?.business_reg_no ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [lat, setLat] = useState<string>(initial?.lat != null ? String(initial.lat) : '');
  const [lng, setLng] = useState<string>(initial?.lng != null ? String(initial.lng) : '');
  const [radius, setRadius] = useState<string>(String(initial?.geo_radius_m ?? 200));
  const [geoRequired, setGeoRequired] = useState<boolean>(!!initial?.geo_required);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose, submitting]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);

      // geo 입력 검증·정규화
      const latNum = lat.trim() === '' ? null : Number(lat);
      const lngNum = lng.trim() === '' ? null : Number(lng);
      const radiusNum = radius.trim() === '' ? null : Number(radius);
      if (latNum != null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)) {
        setError('위도(lat) 는 -90 ~ 90 사이 숫자여야 합니다.');
        setSubmitting(false);
        return;
      }
      if (lngNum != null && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180)) {
        setError('경도(lng) 는 -180 ~ 180 사이 숫자여야 합니다.');
        setSubmitting(false);
        return;
      }
      if (radiusNum != null && (Number.isNaN(radiusNum) || radiusNum < 50 || radiusNum > 1000)) {
        setError('반경은 50 ~ 1000m 사이여야 합니다.');
        setSubmitting(false);
        return;
      }

      const commonBody = {
        store_code: storeCode.trim().toUpperCase(),
        name: name.trim(),
        address: address || null,
        phone: phone || null,
        business_reg_no: bizNo || null,
        lat: latNum,
        lng: lngNum,
        geo_radius_m: radiusNum,
        geo_required: geoRequired,
      };

      try {
        if (mode === 'create') {
          const res = await fetch('/api/hq/stores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(commonBody),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
          toast.success('매장 추가 완료');
        } else if (initial) {
          const res = await fetch(`/api/hq/stores/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...commonBody, active }),
          });
          const json = (await res.json()) as { data: unknown; error: string | null };
          if (!res.ok || json.error) {
            setError(json.error ?? '저장 실패');
            setSubmitting(false);
            return;
          }
          toast.success('매장 정보 갱신');
        }
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [mode, initial, storeCode, name, address, phone, bizNo, active, lat, lng, radius, geoRequired, submitting, onSaved]
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[640px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8"
      >
        <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
          {mode === 'create' ? '매장 추가' : '매장 편집'}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="매장 코드 (로그인 키)">
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              required
              autoCapitalize="characters"
              placeholder="예: BKC02"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
            />
          </Field>
          <Field label="매장명">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        <Field label="주소">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="전화">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
          <Field label="사업자등록번호">
            <input
              type="text"
              value={bizNo}
              onChange={(e) => setBizNo(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout"
            />
          </Field>
        </div>

        {mode === 'edit' && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="text-callout">활성 상태 (체크 해제 시 로그인 차단)</span>
          </label>
        )}

        {/* ── 출퇴근 위치 정책 (모바일 전용) ───────────────────────────── */}
        <div className="rounded-lg border border-[var(--color-separator-opaque)] p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-callout font-semibold">위치정보 사용 (출퇴근 검증)</span>
            <label className="flex items-center gap-2 text-caption1">
              <input
                type="checkbox"
                checked={geoRequired}
                onChange={(e) => setGeoRequired(e.target.checked)}
              />
              {geoRequired ? '사용' : '비사용'}
            </label>
          </div>
          <p className="text-caption2 text-[var(--color-label-tertiary)]">
            <strong>사용</strong>: 모바일 사용자가 매장 좌표 반경 내에서만 로그인/로그아웃 가능 (출근·퇴근 자동 기록).
            <br />
            <strong>비사용</strong>: 어디서든 로그인/로그아웃 가능 (출퇴근 기록 없음).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="위도 (lat)">
              <input
                type="text"
                inputMode="decimal"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="37.581234"
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
              />
            </Field>
            <Field label="경도 (lng)">
              <input
                type="text"
                inputMode="decimal"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="126.985678"
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout font-mono"
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
                className="w-full rounded-lg border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-3 py-2 text-callout tabular-nums"
              />
            </Field>
          </div>
          <p className="text-caption2 text-[var(--color-label-tertiary)]">
            좌표는 Google Maps / Naver 지도에서 매장을 우클릭(또는 길게 누름)하여 복사. GPS 정확도 ±10~50m 고려해 200m 정도 반경 권장.
          </p>
        </div>

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !storeCode.trim() || !name.trim()}
            className="pressable touch-target rounded-xl px-4 py-2.5 bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
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
