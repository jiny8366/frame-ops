// Frame Ops Web — 발주서 인쇄/미리보기 페이지
// 1) 상단: 발주처(매장) + 수주처(매입처) 정보
// 2) 중간: 발주 상품 리스트
// 3) 하단: 합계
// 모드:
//   · preview=1 → 미리보기. 자동 인쇄·마킹 없음.
//   · mark=1    → 데이터 로드 후 발주 처리 마킹 + 자동 인쇄.
//   · 둘 다 없음 → 자동 인쇄만 (구버전 호환).

'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface OrderItem {
  product_id: string;
  brand_name: string;
  style_code: string | null;
  color_code: string | null;
  display_name: string | null;
  total_quantity: number;
  unit_price: number;
  cost_price: number;
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
  const markedRef = useRef(false);

  useEffect(() => {
    if (!supplierId || !from || !to) {
      setError('잘못된 매개변수');
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/orders/pending?from=${from}&to=${to}`);
        const json = (await res.json()) as { data: OrdersResponse | null; error: string | null };
        if (json.error || !json.data) {
          setError(json.error ?? '응답 없음');
          return;
        }
        setData(json.data);
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

    // 마킹은 한 번만 — 인쇄 페이지가 데이터 fetch 완료 → 그 다음 마킹.
    if (shouldMark && !markedRef.current) {
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
  }, [data, printed, shouldMark, shouldAutoPrint, supplierId, from, to]);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-600">{error}</p>
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

  const group = data.groups.find((g) => g.supplier_id === supplierId);
  if (!group) {
    return (
      <main className="p-8">
        <p>해당 매입처 데이터가 없습니다 (이미 발주됐거나 만료된 링크).</p>
      </main>
    );
  }

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
            <th style={{ width: '8%' }}>No</th>
            <th>브랜드</th>
            <th>스타일</th>
            <th>색상</th>
            <th>제품명</th>
            <th className="right" style={{ width: '8%' }}>수량</th>
            <th className="right" style={{ width: '12%' }}>원가</th>
            <th className="right" style={{ width: '14%' }}>합계</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((it, idx) => (
            <tr key={it.product_id}>
              <td>{idx + 1}</td>
              <td>{it.brand_name}</td>
              <td>{it.style_code ?? '—'}</td>
              <td>{it.color_code ?? '—'}</td>
              <td>{it.display_name ?? ''}</td>
              <td className="right">{it.total_quantity.toLocaleString()}</td>
              <td className="right">₩{it.cost_price.toLocaleString()}</td>
              <td className="right">
                ₩{(it.total_quantity * it.cost_price).toLocaleString()}
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
