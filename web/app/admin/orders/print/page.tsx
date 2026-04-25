// Frame Ops Web — 주문리스트 인쇄용 페이지
// 부모 창에서 supplier_id, from, to 쿼리 → /api/admin/orders/pending 호출 → 해당 그룹만 표시.
// 자동 window.print() 트리거 (사용자가 PDF 로 저장).

'use client';

import { useEffect, useState } from 'react';
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

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);

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

  // 데이터 로드 후 자동 인쇄
  useEffect(() => {
    if (data && !printed) {
      // 페이지 렌더 후 약간 딜레이
      const t = window.setTimeout(() => {
        window.print();
        setPrinted(true);
      }, 300);
      return () => window.clearTimeout(t);
    }
  }, [data, printed]);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-system-red">{error}</p>
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
      `}</style>

      <div className="no-print mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-white text-sm"
        >
          다시 인쇄
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-md bg-gray-300 px-3 py-1.5 text-sm"
        >
          창 닫기
        </button>
        <span className="text-xs text-gray-500">
          인쇄 대화상자에서 “PDF 로 저장” 선택 가능
        </span>
      </div>

      {/* 매장 헤더 */}
      <header className="mb-6 border-b-2 border-black pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">발주서 (주문리스트)</h1>
          <span className="text-sm text-gray-600">
            발행일: {new Date().toLocaleDateString('ko-KR')}
          </span>
        </div>
        <div className="mt-2 text-sm">
          <div>
            <strong>발주 매장:</strong> {data.store?.name} ({data.store?.store_code})
          </div>
          {data.store?.address && (
            <div>
              <strong>주소:</strong> {data.store.address}
            </div>
          )}
          {data.store?.phone && (
            <div>
              <strong>연락처:</strong> {data.store.phone}
            </div>
          )}
          {data.store?.business_reg_no && (
            <div>
              <strong>사업자번호:</strong> {data.store.business_reg_no}
            </div>
          )}
        </div>
      </header>

      {/* 매입처 + 기간 */}
      <section className="mb-4 text-sm">
        <div>
          <strong>매입처:</strong> {group.supplier_name}{' '}
          {group.supplier_code && <span className="text-gray-500">({group.supplier_code})</span>}
        </div>
        <div>
          <strong>기간:</strong> {data.period.from} ~ {data.period.to}
        </div>
      </section>

      {/* 항목 테이블 */}
      <table>
        <thead>
          <tr>
            <th>브랜드</th>
            <th>스타일</th>
            <th>색상</th>
            <th>제품명</th>
            <th className="right">수량</th>
            <th className="right">원가</th>
            <th className="right">합계</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((it) => (
            <tr key={it.product_id}>
              <td>{it.brand_name}</td>
              <td>{it.style_code ?? '—'}</td>
              <td>{it.color_code ?? '—'}</td>
              <td>{it.display_name ?? ''}</td>
              <td className="right">{it.total_quantity}</td>
              <td className="right">₩{it.cost_price.toLocaleString()}</td>
              <td className="right">
                ₩{(it.total_quantity * it.cost_price).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={4} className="right">
              합계
            </th>
            <th className="right">{group.total_quantity}</th>
            <th></th>
            <th className="right">₩{group.total_cost.toLocaleString()}</th>
          </tr>
        </tfoot>
      </table>

      {/* 푸터 */}
      <footer className="mt-12 text-xs text-gray-600">
        <p>본 자료는 Frame Ops 시스템에서 자동 생성된 발주 자료입니다.</p>
      </footer>
    </main>
  );
}
