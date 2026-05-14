'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={null}>
      <CustomerLoginInner />
    </Suspense>
  );
}

function CustomerLoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/customer';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password, expectedRole: 'customer' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(errorMessage(body.error));
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError('네트워크 오류');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">고객 로그인</h1>
          <p className="mt-1 text-sm text-gray-500">Funnyview Pickup</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="휴대전화번호"
            name="phone"
            inputMode="numeric"
            placeholder="01012345678"
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <div className="flex justify-between text-sm">
          <Link href="/register" className="text-brand-600 hover:underline">
            회원가입
          </Link>
          <Link href="/" className="text-gray-500 hover:underline">
            처음으로
          </Link>
        </div>

        <div className="border-t pt-4 text-center text-xs text-gray-400">
          픽업서비스 직원은{' '}
          <Link href="/login/warehouse" className="underline">
            업체용
          </Link>{' '}
          ·{' '}
          <Link href="/login/store" className="underline">
            가맹점용
          </Link>{' '}
          로그인
        </div>
      </div>
    </main>
  );
}

function errorMessage(code?: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return '전화번호 또는 비밀번호가 올바르지 않습니다';
    case 'ROLE_MISMATCH':
      return '고객 계정으로 로그인해주세요';
    case 'INACTIVE_USER':
      return '비활성화된 계정입니다';
    default:
      return '로그인에 실패했습니다';
  }
}
