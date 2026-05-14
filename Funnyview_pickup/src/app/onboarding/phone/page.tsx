'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function OnboardingPhonePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPhoneInner />
    </Suspense>
  );
}

function OnboardingPhoneInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/customer';

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/profile/phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error === 'PHONE_TAKEN' ? '이미 사용 중인 번호입니다' : '저장 실패');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">전화번호를 알려주세요</h1>
          <p className="mt-1 text-sm text-gray-500">
            픽업 알림과 주문 확인용으로 사용됩니다
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="휴대전화번호"
            inputMode="numeric"
            placeholder="01012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || phone.length < 10}>
            {loading ? '저장 중...' : '확인'}
          </Button>
        </form>
      </div>
    </main>
  );
}
