'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils/format';

interface Notification {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  referenceType: string | null;
  referenceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications?limit=20', { cache: 'no-store' });
    if (!res.ok) return;
    const j = await res.json();
    setItems(j.notifications ?? []);
    setUnread(j.unreadCount ?? 0);
  }, []);

  useEffect(() => {
    load();
    // SSE 연결
    try {
      const es = new EventSource('/api/events/stream');
      es.addEventListener('notify', () => {
        load();
      });
      es.onerror = () => {
        // 연결 끊김 — 30초 후 폴링이 갱신
      };
      esRef.current = es;
    } catch {
      // 무시
    }
    // SSE 미지원 환경을 위한 폴링
    const t = setInterval(load, 30_000);
    return () => {
      clearInterval(t);
      esRef.current?.close();
    };
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    load();
  }

  function hrefFor(n: Notification): string | null {
    if (n.referenceType === 'order' && n.referenceId) {
      return `/customer/orders/${n.referenceId}`;
    }
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-1.5 text-gray-600 hover:bg-gray-100"
        aria-label="알림"
      >
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 max-h-[28rem] w-80 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-lg">
          <div className="sticky top-0 border-b bg-white px-4 py-2 text-xs font-semibold text-gray-500">
            알림 {unread > 0 && <span className="text-red-600">· 새 {unread}</span>}
          </div>
          <ul className="divide-y divide-gray-100">
            {items.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-gray-400">새 알림이 없습니다</li>
            )}
            {items.map((n) => {
              const href = hrefFor(n);
              const body = (
                <div className={n.readAt ? 'opacity-60' : ''}>
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="mt-0.5 text-xs text-gray-600">{n.body}</div>
                  <div className="mt-1 text-[10px] text-gray-400">{formatDateTime(n.createdAt)}</div>
                </div>
              );
              return (
                <li key={n.id} className="px-4 py-3">
                  {href ? (
                    <Link
                      href={href}
                      onClick={() => {
                        if (!n.readAt) markRead(n.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !n.readAt && markRead(n.id)}
                      className="block w-full text-left"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
