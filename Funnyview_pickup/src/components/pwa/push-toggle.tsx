'use client';

import { useCallback, useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) arr[i] = rawData.charCodeAt(i);
  return arr;
}

type PushStatus = 'unsupported' | 'no-vapid' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

export function PushToggle() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      setStatus('unsubscribed');
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      setEndpoint(sub.endpoint);
      setStatus('subscribed');
    } else {
      setStatus('unsubscribed');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function subscribe() {
    setStatus('loading');
    try {
      const vapidRes = await fetch('/api/push/vapid-key');
      const vapid = await vapidRes.json();
      if (!vapid.publicKey) {
        setStatus('no-vapid');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as unknown as BufferSource,
      });

      const json = sub.toJSON();
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      setEndpoint(sub.endpoint);
      setStatus('subscribed');
    } catch {
      setStatus('unsubscribed');
    }
  }

  async function unsubscribe() {
    setStatus('loading');
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe().catch(() => {});
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
    setEndpoint(null);
    setStatus('unsubscribed');
  }

  if (status === 'unsupported' || status === 'no-vapid') return null;
  if (status === 'loading') {
    return <span className="text-xs text-gray-400">알림 설정 확인 중...</span>;
  }
  if (status === 'denied') {
    return <span className="text-xs text-gray-400">알림 차단됨 (브라우저 설정)</span>;
  }

  return status === 'subscribed' ? (
    <button
      type="button"
      onClick={unsubscribe}
      className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
      title={endpoint ?? undefined}
    >
      🔔 푸시 ON
    </button>
  ) : (
    <button
      type="button"
      onClick={subscribe}
      className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
    >
      🔔 알림 받기
    </button>
  );
}
