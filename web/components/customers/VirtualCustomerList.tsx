// Frame Ops — 가상 스크롤 고객 목록

'use client';

import { FixedSizeList } from 'react-window';
import { useRouter } from 'next/navigation';
import { prefetchHandlers, usePrefetchCustomer } from '@/hooks/usePrefetch';
import type { Customer } from '@/types';

interface VirtualCustomerListProps {
  customers: Customer[];
}

const ROW_HEIGHT = 68;

export function VirtualCustomerList({ customers }: VirtualCustomerListProps) {
  const router = useRouter();
  const prefetch = usePrefetchCustomer();

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const customer = customers[index];
    if (!customer) return null;

    return (
      <div style={{ ...style, paddingBottom: 8 }}>
        <button
          className="
            w-full flex items-center gap-3 rounded-xl border border-gray-100
            bg-white px-4 py-3 text-left shadow-sm
            active:scale-[0.99] transition-transform duration-75
          "
          onClick={() => router.push(`/customers/${customer.id}`)}
          {...prefetchHandlers(customer.id, prefetch)}
        >
          {/* 아바타 */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-subhead font-semibold">
            {customer.name.charAt(0)}
          </div>
          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <p className="text-body font-semibold text-gray-900 truncate">{customer.name}</p>
            <p className="text-footnote text-gray-400 truncate">{customer.phone ?? '—'}</p>
          </div>
          {/* 방문일 */}
          <p className="text-caption2 text-gray-300 shrink-0">
            {customer.updated_at
              ? new Date(customer.updated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
              : ''}
          </p>
        </button>
      </div>
    );
  };

  if (customers.length === 0) {
    return (
      <p className="py-12 text-center text-subhead text-gray-400">
        고객이 없습니다.
      </p>
    );
  }

  return (
    <FixedSizeList
      height={typeof window !== 'undefined' ? window.innerHeight - 160 : 600}
      itemCount={customers.length}
      itemSize={ROW_HEIGHT}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
