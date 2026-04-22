// Frame Ops — 고객 관리 목록
'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { CustomerListSkeleton } from '@/components/skeletons';
import type { Customer } from '@/types';

// 고객 목록 — 초기 번들에서 제외
const VirtualCustomerList = dynamic(
  () => import('@/components/customers/VirtualCustomerList').then((m) => m.VirtualCustomerList),
  {
    ssr: false,
    loading: () => <CustomerListSkeleton count={8} />,
  }
);

async function fetchCustomers(search: string): Promise<Customer[]> {
  let query = supabase
    .from('fo_customers')
    .select('*')
    .order('name', { ascending: true })
    .limit(100);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data: customers, isLoading, isValidating } = useSWR(
    ['customers', search],
    () => fetchCustomers(search),
    { revalidateOnFocus: false }
  );

  return (
    <main className="min-h-screen bg-surface-secondary safe-padding">
      <div className="sticky top-0 z-10 bg-surface-secondary/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-gray-100">
        <h1 className="text-title2 font-bold mb-3">고객 관리</h1>
        <div className="relative">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 전화번호 검색..."
            className="
              w-full rounded-xl border border-gray-200 bg-white
              px-4 py-3 text-body placeholder:text-gray-400
              focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100
            "
          />
          {isValidating && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <CustomerListSkeleton count={8} />
        ) : (
          <VirtualCustomerList customers={customers ?? []} />
        )}
      </div>
    </main>
  );
}
