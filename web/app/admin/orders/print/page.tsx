// Frame Ops Web — 발주서 인쇄/미리보기 페이지
// 1) 상단: 발주처(매장) + 수주처(매입처) 정보
// 2) 중간: 발주 상품 리스트
// 3) 하단: 합계
// 모드:
//   · preview=1 → 미리보기. 자동 인쇄·마킹 없음.
//   · mark=1    → 데이터 로드 후 발주 처리 마킹 + 자동 인쇄.
//   · 둘 다 없음 → 자동 인쇄만 (구버전 호환).
//
// 캐시 정책 (2026-05-18 추가):
//   첫 fetch 성공 시 sessionStorage 에 24h TTL 로 저장.
//   재방문/새로고침 시 캐시 우선 사용 — 마킹 후에도 PDF 재인쇄 가능.
//   원인: fetch 가 미발주(ordered_at IS NULL) 만 조회하므로
//   마킹 후엔 해당 supplier 그룹이 빈 결과로 떨어져 "데이터 없음" 으로 보였음.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatColor } from '@/lib/product-codes';

interface OrderItem {
  product_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  current_stock?: number;
  total_quantity: number;
  unit_price: number;
  cost_price: number;
}

const QTY_OVERRIDE_KEY = 'fo_orders_qty_overrides';
function loadOverrides(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(QTY_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

// 인쇄용 데이터 캐시 — 마킹 후에도 PDF 재인쇄 가능하도록.
const PRINT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
function printCacheKey(supplierId: string, from: string, to: string): string {
  return `fo_orders_print_${supplierId}_${from}_${to}`;
}
function loadPrintCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: T };
    if (Date.now() - parsed.ts > PRINT_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
function savePrintCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota 초과 등 — 무시 */
  }
}

interface SupplierGroup {
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  supplier_business_number: string | null;
  supplier_address: string | null;
  supplier_contact: string | null;
  items: OrderItem[];
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
}

interface OrdersResponse {
  period: { from: string; to: string };
  store: {
    name: string;
    store_code: string;
    address: string | null;
    phone: string | null;
    business_reg_no: string | null;
  } | null;
  groups: SupplierGroup[];
}

export default function OrdersPrintPage() {
  const params = useSearchParams();
  const supplierId = params.get('supplier_id') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const isPreview = params.get('preview') === '1';
  const shouldMark = !isPreview && params.get('mark') === '1';
  const shouldAutoPrint = !isPreview;

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const markedRef = useRef(false);

  useEffect(() => {
    if (!supplierId || !from || !to) {
      setError('잘못된 매개변수');
      return;
    }
    const cacheKey = printCacheKey(supplierId, from, to);

    // 1) sessionStorage 캐시 우선 — 첫 fetch 가 성공한 적이 있으면 즉시 표시.
    //    마킹 후 새로고침해도 데이터 보존되어 재인쇄 가능.
    const cached = loadPrintCache<OrdersResponse>(cacheKey);
    if (cached) {
      const hasGroup = cached.groups?.some((g) => g.supplier_id === supplierId);
      if (hasGroup) {
        setData(cached);
        setFromCache(true);
        return; // mark/print 흐름은 두 번째 useEffect 에서 처리 (markedRef 가드)
      }
    }

    // 2) API fetch — 캐시 미스 또는 캐시에 해당 그룹 없을 때만
    void (async () => {
      try {
        const res = await fetch(`/api/admin/orders/pending?from=${from}&to=${to}`);
        const json = (await res.json()) as { data: OrdersResponse | null; error: string | null };
        if (json.error || !json.data) {
          setError(json.error ?? '응답 없음');
          return;
        }
        const hasGroup = json.data.groups?.some((g) => g.supplier_id === supplierId);
        if (!hasGroup) {
          // 마킹 후 새로고침 시나리오 — 사용자에게 명확한 안내
          setError(
            '해당 매입처의 미발주 항목이 없습니다.\n' +
              '이미 발주 처리되었을 수 있습니다. 같은 창에서 "다시 인쇄" 버튼으로 재인쇄 가능합니다.'
          );
          return;
        }
        setData(json.data);
        savePrintCache(cacheKey, json.data); // 다음 새로고침 대비 캐시
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [supplierId, from, to]);

  // 데이터 로드 후 자동 인쇄(인쇄 모드) + (요청 시) 발주 처리 마킹
  useEffect(() => {
    if (!data || printed) return;

    // 인쇄 트리거 — 미리보기 모드일 땐 생략
    let t: number | undefined;
    if (shouldAutoPrint) {
      t = window.setTimeout(() => {
        window.print();
        setPrinted(true);
      }, 300);
    } else {
      setPrinted(true);
    }

    // 마킹은 한 번만, 그리고 캐시에서 로드된 경우는 마킹 스킵 (이미 됐을 가능성 ↑).
    // 처음 PDF 다운로드 시에만 마킹 실행. 새로고침/재인쇄는 마킹 안 함.
    if (shouldMark && !markedRef.current && !fromCache) {
      markedRef.current = true;
      void (async () => {
        try {
          const res = await fetch('/api/admin/orders/place', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplier_id: supplierId, from, to }),
          });
          if (!res.ok) {
            // 마킹 실패는 인쇄에 영향을 주지 않음 (사용자가 새로고침해서 재시도 가능)
            console.error('mark_orders_placed failed', await res.text());
          }
        } catch (e) {
          console.error('mark_orders_placed error', e);
        }
      })();
    }

    return () => {
      if (t !== undefined) window.clearTimeout(t);
    };
  }, [data, printed, shouldMark, shouldAutoPrint, fromCache, supplierId, from, to]);

  if (error) {
    return (
      <main className="p-8 max-w-[640px] mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700 whitespace-pre-line font-medium">{error}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-md bg-gray-200 px-3 py-1.5 text-sm"
            >
              창 닫기
            </button>
            <button
              type="button"
              onClick={() => {
                // 같은 키의 캐시도 제거 후 재시도 (보존된 데이터 있으면 표시됨)
                window.location.reload();
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-white text-sm"
            >
              다시 시도
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="p-8">
        <p>불러오는 중…</p>
      </main>
    );
  }

  const rawGroup = data.groups.find((g) => g.supplier_id === supplierId);
  if (!rawGroup) {
    return (
      <main className="p-8 max-w-[640px] mx-auto">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-amber-800 font-medium">
            해당 매입처의 미발주 항목이 없습니다.
          </p>
          <p className="text-sm text-amber-700 mt-2">
            이미 발주 처리되었을 수 있습니다. 처음 PDF 다운로드 받은 창이 닫히지 않았다면
            그 창의 &ldquo;다시 인쇄&rdquo; 버튼으로 재인쇄가 가능합니다.
          </p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-3 rounded-md bg-gray-300 px-3 py-1.5 text-sm"
          >
            창 닫기
          </button>
        </div>
      </main>
    );
  }

  // 부모 창에서 편집한 수량 override 적용
  const overrides = loadOverrides();
  const items = rawGroup.items.map((it) => ({
    ...it,
    qty: overrides[it.product_id] ?? it.total_quantity,
  }));
  const totalQty = items.reduce((s, it) => s + it.qty, 0);
  const totalCost = items.reduce((s, it) => s + it.qty * it.cost_price, 0);
  const group = { ...rawGroup, items, total_quantity: totalQty, total_cost: totalCost };

  const issueDate = new Date().toLocaleDateString('ko-KR');

  return (
    <main className="print-root mx-auto max-w-[210mm] p-8 bg-white text-black">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          header,
          nav,
          footer {
            display: none !important;
          }
        }
        .print-root {
          font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Apple SD Gothic Neo',
            sans-serif;
          color: #000;
        }
        .print-root table {
          width: 100%;
          border-collapse: collapse;
        }
        .print-root th,
        .print-root td {
          border-bottom: 1px solid #ddd;
          padding: 6px 8px;
          text-align: left;
          font-size: 11pt;
        }
        .print-root th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .print-root .right {
          text-align: right;
        }
        .party-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .party-box {
          border: 1px solid #ccc;
          padding: 10px 12px;
          font-size: 10.5pt;
        }
        .party-box .label {
          font-size: 9pt;
          color: #555;
          margin-bottom: 4px;
          letter-spacing: 0.5px;
        }
        .party-box .name {
          font-size: 13pt;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .party-box .row {
          display: flex;
          gap: 6px;
          margin-top: 2px;
        }
        .party-box .row strong {
          min-width: 60px;
          color: #333;
          font-weight: 600;
        }
        .totals {
          margin-top: 16px;
          border-top: 2px solid #000;
          padding-top: 10px;
          display: flex;
          justify-content: flex-end;
          gap: 28px;
          font-size: 12pt;
        }
        .totals .item {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .totals .item .label {
          font-size: 9pt;
          color: #666;
        }
        .totals .item .value {
          font-weight: 700;
        }
      `}</style>

      <div className="no-print mb-4 flex items-center gap-3 flex-wrap">
        {isPreview && (
          <span className="rounded-md bg-amber-100 text-amber-800 px-2 py-1 text-xs font-semibold">
            미리보기 (발주 처리 안 됨)
          </span>
        )}
        {fromCache && !isPreview && (
          <span
            className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-1 text-xs font-semibold"
            title="이전에 다운로드한 발주서를 캐시로 불러왔습니다. 발주 처리는 첫 다운로드 시에만 실행됩니다."
          >
            재인쇄 (캐시)
          </span>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-white text-sm"
        >
          {isPreview ? '인쇄' : '다시 인쇄'}
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md bg-gray-300 px-3 py-1.5 text-sm"
        >
          창 닫기
        </button>
        <span className="text-xs text-gray-500">
          인쇄 대화상자에서 &ldquo;PDF 로 저장&rdquo; 선택 가능
        </span>
      </div>

      {/* 제목 */}
      <header className="mb-4 border-b-2 border-black pb-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">발 주 서</h1>
        <span className="text-sm text-gray-700">발행일: {issueDate}</span>
      </header>

      {/* 상단: 발주처 / 수주처 */}
      <section className="party-grid">
        {/* 발주처 = 매장 */}
        <div className="party-box">
          <div className="label">발 주 처 (Buyer)</div>
          <div className="name">
            {data.store?.name ?? '—'}
            {data.store?.store_code && (
              <span className="ml-2 text-sm font-mono font-normal text-gray-600">
                {data.store.store_code}
              </span>
            )}
          </div>
          {data.store?.business_reg_no && (
            <div className="row">
              <strong>사업자번호</strong>
              <span>{data.store.business_reg_no}</span>
            </div>
          )}
          {data.store?.address && (
            <div className="row">
              <strong>주소</strong>
              <span>{data.store.address}</span>
            </div>
          )}
          {data.store?.phone && (
            <div className="row">
              <strong>연락처</strong>
              <span>{data.store.phone}</span>
            </div>
          )}
        </div>

        {/* 수주처 = 매입처 */}
        <div className="party-box">
          <div className="label">수 주 처 (Supplier)</div>
          <div className="name">
            {group.supplier_name}
            {group.supplier_code && (
              <span className="ml-2 text-sm font-mono font-normal text-gray-600">
                {group.supplier_code}
              </span>
            )}
          </div>
          {group.supplier_business_number && (
            <div className="row">
              <strong>사업자번호</strong>
              <span>{group.supplier_business_number}</span>
            </div>
          )}
          {group.supplier_address && (
            <div className="row">
              <strong>주소</strong>
              <span>{group.supplier_address}</span>
            </div>
          )}
          {group.supplier_contact && (
            <div className="row">
              <strong>연락처</strong>
              <span>{group.supplier_contact}</span>
            </div>
          )}
        </div>
      </section>

      <p className="mb-2 text-sm">
        <strong>판매 발생 기간:</strong> {data.period.from} ~ {data.period.to}
      </p>

      {/* 중간: 발주 상품 리스트 */}
      <table>
        <thead>
          <tr>
            <th style={{ width: '8%' }}>No.</th>
            <th>브랜드</th>
            <th>제품번호</th>
            <th>색상</th>
            <th className="right" style={{ width: '10%' }}>수량</th>
            <th className="right" style={{ width: '14%' }}>매입가</th>
            <th className="right" style={{ width: '16%' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((it, idx) => (
            <tr key={it.product_id}>
              <td>{idx + 1}</td>
              <td>{it.brand_name}</td>
              <td>{it.style_code ?? '—'}</td>
              <td>{formatColor(it.color_code)}</td>
              <td className="right">{it.qty.toLocaleString()}</td>
              <td className="right">₩{it.cost_price.toLocaleString()}</td>
              <td className="right">
                ₩{(it.qty * it.cost_price).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 하단: 합계 */}
      <section className="totals">
        <div className="item">
          <span className="label">총 품목 수</span>
          <span className="value">{group.items.length.toLocaleString()}</span>
        </div>
        <div className="item">
          <span className="label">총 수량</span>
          <span className="value">{group.total_quantity.toLocaleString()}</span>
        </div>
        <div className="item">
          <span className="label">총 원가 합계</span>
          <span className="value">₩{group.total_cost.toLocaleString()}</span>
        </div>
      </section>

      {/* 발행자 사인 영역 */}
      <section className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="border-t border-black pt-2">발 주 자: ____________________</div>
        </div>
        <div>
          <div className="border-t border-black pt-2">수 주 자: ____________________</div>
        </div>
      </section>

      <footer className="mt-12 text-xs text-gray-600">
        <p>본 자료는 Frame Ops 시스템에서 자동 생성된 발주 자료입니다.</p>
      </footer>
    </main>
  );
}
