'use client';

import { useEffect, useState } from 'react';

type Provider = 'naver' | 'kakao' | 'google';

const META: Record<
  Provider,
  { label: string; bg: string; text: string; icon: string }
> = {
  kakao: { label: '카카오로 시작', bg: 'bg-[#FEE500]', text: 'text-black', icon: '💬' },
  naver: { label: '네이버로 시작', bg: 'bg-[#03C75A]', text: 'text-white', icon: 'N' },
  google: { label: 'Google로 시작', bg: 'bg-white border border-gray-300', text: 'text-gray-800', icon: 'G' },
};

export function SocialButtons({ returnTo }: { returnTo?: string }) {
  const [enabled, setEnabled] = useState<Provider[] | null>(null);

  useEffect(() => {
    fetch('/api/auth/oauth/providers')
      .then((r) => r.json())
      .then((j) => setEnabled(j.providers ?? []))
      .catch(() => setEnabled([]));
  }, []);

  if (enabled === null) {
    return <div className="h-10 animate-pulse rounded-lg bg-gray-100" />;
  }
  if (enabled.length === 0) return null;

  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';

  return (
    <div className="space-y-2">
      {enabled.map((p) => {
        const m = META[p];
        return (
          <a
            key={p}
            href={`/api/auth/oauth/${p}/start${query}`}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg font-medium ${m.bg} ${m.text} transition hover:opacity-90`}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-xs font-bold">
              {m.icon}
            </span>
            <span>{m.label}</span>
          </a>
        );
      })}
    </div>
  );
}
