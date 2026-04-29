// Frame Ops Web — 점간이동 받은 전표함 팝업
// 로그인 후 미처리 점간이동 전표가 있으면 자동 표시. 항목별 승인/반려 처리.
// 닫기 후엔 같은 세션 내에서 재팝업 안 함 (sessionStorage 키 사용).

'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';
import { useSession } from '@/hooks/useSession';
import { formatColor } from '@/lib/product-codes';

interface InboxItem {
  id: string;
  document_at: string;
  note: string | null;
  status: string;
  created_at: string;
  from_store_id: string;
  to_store_id: string;
  from_store: { id: string; store_code: string; name: string } | null;
  to_store: { id: string; store_code: string; name: string } | null;
  lines: Array<{
    id: string;
    quantity: number;
    unit_cost: number;
    product: {
      style_code: string | null;
      color_code: string | null;
      brand: { name: string | null } | null;
    } | null;
  }>;
}

const inboxFetcher = async (url: string): Promise<InboxItem[]> => {
  const res = await fetch(url);
  const json = (await res.json()) as { data: InboxItem[] | null; error: string | null };
  if (json.error) throw new Error(json.error);
  return json.data ?? [];
};

const DISMISS_KEY = 'transfer_inbox_dismissed_v1';

export function TransferInboxDialog() {
  const { session } = useSession();
  const enabled = !!session;
  const { data: items = [], mutate: refetch } = useSWR<InboxItem[]>(
    enabled ? '/api/admin/transfers/inbox' : null,
    inboxFetcher,
    { revalidateOnFocus: true, refreshInterval: 60_000 }
  );

  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // 세션 시작 시 dismissed 상태 복구
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = sessionStorage.getItem(DISMISS_KEY);
    if (v === 'yes') setDismissed(true);
  }, []);

  const visibleItems = useMemo(() => items.filter((i) => i.status === 'pending'), [items]);
  const shouldShow = !dismissed && visibleItems.length > 0;

  const handleClose = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DISMISS_KEY, 'yes');
    }
  };

  const handleApprove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/transfers/${id}/approve`, { method: 'POST' });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '승인 실패');
        return;
      }
      toast.success('승인 완료 — 매입 등록 + 재고 반영됨');
      // 관련 캐시 무효화
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/transfers'));
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/inbound'));
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/inventory'));
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('반려 사유를 입력하세요 (선택)');
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/transfers/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_note: reason ?? null }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (!res.ok || json.error) {
        toast.error(json.error ?? '반려 실패');
        return;
      }
      toast.success('반려 처리 완료');
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/admin/transfers'));
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  if (!shouldShow) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-[760px] flex flex-col gap-3 rounded-2xl bg-[var(--color-bg-secondary)] p-5 my-8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-headline font-semibold text-[var(--color-label-primary)]">
              📦 받은 점간이동 전표 ({visibleItems.length}건)
            </h2>
            <p className="text-caption1 text-[var(--color-label-tertiary)] mt-0.5">
              승인 시 매입 등록 + 재고 반영. 반려 시 변동 없음.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="pressable rounded-lg px-3 py-1.5 text-callout bg-[var(--color-fill-tertiary)]"
          >
            닫기
          </button>
        </div>

        <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          {visibleItems.map((item) => {
            const totalQty = item.lines.reduce((s, l) => s + l.quantity, 0);
            const totalCost = item.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] p-3 flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="flex items-baseline gap-2">
                    <span className="text-callout font-semibold">
                      {item.from_store?.name ?? '—'} → {item.to_store?.name ?? '—'}
                    </span>
                    <span className="text-caption1 text-[var(--color-label-tertiary)] tabular-nums">
                      {item.document_at.slice(0, 10)}
                    </span>
                  </div>
                  <div className="text-caption1 tabular-nums text-[var(--color-label-secondary)]">
                    {item.lines.length}품목 · {totalQty}점 · ₩{totalCost.toLocaleString()}
                  </div>
                </div>

                {item.note && (
                  <p className="text-caption1 text-[var(--color-label-secondary)]">
                    비고: {item.note}
                  </p>
                )}

                <div className="data-list-scroll" style={{ maxHeight: 220 }}>
                  <table className="data-list-table">
                    <thead>
                      <tr>
                        <th>브랜드</th>
                        <th>제품번호</th>
                        <th>컬러</th>
                        <th className="num">수량</th>
                        <th className="num">단가</th>
                        <th className="num">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.lines.map((l) => (
                        <tr key={l.id}>
                          <td>{l.product?.brand?.name ?? '—'}</td>
                          <td className="code">{l.product?.style_code ?? '—'}</td>
                          <td className="code">{formatColor(l.product?.color_code)}</td>
                          <td className="num">{l.quantity}</td>
                          <td className="num">₩{l.unit_cost.toLocaleString()}</td>
                          <td className="num" style={{ fontWeight: 600 }}>
                            ₩{(l.quantity * l.unit_cost).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleReject(item.id)}
                    disabled={busy === item.id}
                    className="pressable touch-target rounded-xl bg-[var(--color-fill-secondary)] text-[var(--color-label-primary)] font-semibold disabled:opacity-40"
                  >
                    반려
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(item.id)}
                    disabled={busy === item.id}
                    className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] text-white font-semibold disabled:opacity-40"
                  >
                    {busy === item.id ? '처리 중…' : '승인'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
