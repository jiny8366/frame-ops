'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils/format';

interface LensVariant {
  variantId: string;
  sku: string;
  sphere: string;
  cylinder: string | null;
  axis: number | null;
  addPower: string | null;
  price: number;
  available: number;
}

interface Lens {
  lensId: string;
  productCode: string;
  brand: string;
  name: string;
  lensType: string;
  replacementCycle: string;
  piecesPerBox: number;
  price: number;
  imageUrl: string | null;
  variants: LensVariant[];
}

interface Store {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
}

type EyeSide = 'left' | 'right';

interface EyeSelection {
  variantId: string | null;
  quantity: number;
}

export default function CustomerOrderPage() {
  const router = useRouter();
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null);
  const [leftSel, setLeftSel] = useState<EyeSelection>({ variantId: null, quantity: 1 });
  const [rightSel, setRightSel] = useState<EyeSelection>({ variantId: null, quantity: 1 });
  const [storeId, setStoreId] = useState<string | null>(null);
  const [payOnline, setPayOnline] = useState(true);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/lenses').then((r) => r.json()),
      fetch('/api/stores').then((r) => r.json()),
    ])
      .then(([lensData, storeData]) => {
        setLenses(lensData.lenses ?? []);
        setStores(storeData.stores ?? []);
      })
      .catch(() => setError('데이터를 불러오지 못했습니다'));
  }, []);

  const selectedLens = useMemo(
    () => lenses.find((l) => l.lensId === selectedLensId) ?? null,
    [lenses, selectedLensId],
  );

  const total = useMemo(() => {
    let sum = 0;
    if (selectedLens) {
      const lv = selectedLens.variants.find((v) => v.variantId === leftSel.variantId);
      const rv = selectedLens.variants.find((v) => v.variantId === rightSel.variantId);
      if (lv) sum += lv.price * leftSel.quantity;
      if (rv) sum += rv.price * rightSel.quantity;
    }
    return sum;
  }, [selectedLens, leftSel, rightSel]);

  const canSubmit =
    !!selectedLens &&
    !!storeId &&
    (leftSel.variantId !== null || rightSel.variantId !== null) &&
    !submitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const lines: Array<{ variantId: string; eyeSide: EyeSide; quantity: number }> = [];
    if (leftSel.variantId) lines.push({ variantId: leftSel.variantId, eyeSide: 'left', quantity: leftSel.quantity });
    if (rightSel.variantId) lines.push({ variantId: rightSel.variantId, eyeSide: 'right', quantity: rightSel.quantity });

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pickupStoreId: storeId,
        customerNote: note || undefined,
        lines,
        payOnline,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.message ?? '주문 생성 실패');
      return;
    }
    const data = await res.json();
    router.replace(`/customer/orders/${data.orderId}`);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">주문하기</h1>
        <p className="mt-1 text-sm text-gray-500">상품 → 도수 → 픽업가맹점 → 결제</p>
      </header>

      {/* 1. 상품 선택 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">1. 상품 선택</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {lenses.map((l) => (
            <button
              key={l.lensId}
              type="button"
              onClick={() => {
                setSelectedLensId(l.lensId);
                setLeftSel({ variantId: null, quantity: 1 });
                setRightSel({ variantId: null, quantity: 1 });
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedLensId === l.lensId
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-gray-200 bg-white hover:border-brand-300'
              }`}
            >
              <div className="text-xs text-gray-500">{l.brand}</div>
              <div className="font-semibold">{l.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                {l.lensType} · {l.replacementCycle} · {l.piecesPerBox}매/박스
              </div>
              <div className="mt-2 font-medium text-brand-700">{formatKRW(l.price)}</div>
            </button>
          ))}
          {lenses.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 md:col-span-2">
              등록된 렌즈가 없습니다
            </div>
          )}
        </div>
      </section>

      {/* 2. 도수 선택 (좌/우) */}
      {selectedLens && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">2. 좌우 도수 입력</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EyeSelector
              title="왼쪽 (Left, OS)"
              variants={selectedLens.variants}
              value={leftSel}
              onChange={setLeftSel}
            />
            <EyeSelector
              title="오른쪽 (Right, OD)"
              variants={selectedLens.variants}
              value={rightSel}
              onChange={setRightSel}
            />
          </div>
        </section>
      )}

      {/* 3. 픽업가맹점 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">3. 픽업가맹점 선택</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStoreId(s.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                storeId === s.id
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-gray-200 bg-white hover:border-brand-300'
              }`}
            >
              <div className="font-semibold">{s.name}</div>
              <div className="mt-1 text-xs text-gray-500">{s.phone}</div>
              <div className="mt-1 text-xs text-gray-500">{s.address}</div>
            </button>
          ))}
          {stores.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400 md:col-span-2">
              가맹점이 없습니다
            </div>
          )}
        </div>
      </section>

      {/* 4. 결제 */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">4. 결제 방식</h2>
        <div className="flex gap-3">
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4">
            <input
              type="radio"
              checked={payOnline}
              onChange={() => setPayOnline(true)}
            />
            <div>
              <div className="font-medium">온라인 선결제</div>
              <div className="text-xs text-gray-500">카드 · 간편결제 (Mock)</div>
            </div>
          </label>
          <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4">
            <input
              type="radio"
              checked={!payOnline}
              onChange={() => setPayOnline(false)}
            />
            <div>
              <div className="font-medium">매장 결제</div>
              <div className="text-xs text-gray-500">픽업 시 결제</div>
            </div>
          </label>
        </div>

        <textarea
          className="w-full rounded-lg border border-gray-300 p-3 text-sm"
          rows={2}
          placeholder="요청사항 (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      {/* 합계 + 제출 */}
      <section className="sticky bottom-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">결제 예정 금액</div>
            <div className="text-xl font-bold">{formatKRW(total)}</div>
          </div>
          <Button onClick={onSubmit} disabled={!canSubmit} size="lg">
            {submitting ? '주문 중...' : '주문하기'}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}

function EyeSelector({
  title,
  variants,
  value,
  onChange,
}: {
  title: string;
  variants: LensVariant[];
  value: EyeSelection;
  onChange: (v: EyeSelection) => void;
}) {
  const [skipEye, setSkipEye] = useState(value.variantId == null);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <label className="text-xs text-gray-500">
          <input
            type="checkbox"
            checked={skipEye}
            onChange={(e) => {
              setSkipEye(e.target.checked);
              if (e.target.checked) onChange({ variantId: null, quantity: 1 });
            }}
            className="mr-1"
          />
          이 눈은 주문 안 함
        </label>
      </div>

      {!skipEye && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500">도수 선택 (SKU)</label>
            <select
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
              value={value.variantId ?? ''}
              onChange={(e) =>
                onChange({ ...value, variantId: e.target.value || null })
              }
            >
              <option value="">선택...</option>
              {variants
                .filter((v) => v.available > 0)
                .map((v) => (
                  <option key={v.variantId} value={v.variantId}>
                    S {formatSign(v.sphere)}
                    {v.cylinder && Number(v.cylinder) !== 0
                      ? ` / C ${formatSign(v.cylinder)} / Ax ${v.axis ?? ''}`
                      : ''}
                    {' '}— 재고 {v.available}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">수량 (박스)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={value.quantity}
              onChange={(e) =>
                onChange({ ...value, quantity: Math.max(1, Number(e.target.value)) })
              }
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatSign(v: string | null): string {
  if (v == null) return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}
