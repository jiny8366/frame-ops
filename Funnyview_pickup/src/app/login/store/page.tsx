'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function StoreLoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/store';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, password, expectedRole: 'store_staff' }),
    });
    setLoading(false);
    if (!res.ok) {
      setError('인증 실패');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">픽업가맹점 로그인</h1>
          <p className="mt-1 text-sm text-amber-700">Store Portal</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="아이디 (전화번호)"
            name="phone"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
          <Input
            label="비밀번호"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <div className="text-center text-xs text-gray-400">
          <Link href="/" className="hover:underline">처음으로</Link>
        </div>
      </div>
    </main>
  );
}
