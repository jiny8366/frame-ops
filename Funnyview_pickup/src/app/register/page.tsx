'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SocialButtons } from '@/components/auth/social-buttons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    birthDate: '',
    gender: '',
    postalCode: '',
    addressLine1: '',
    addressLine2: '',
    referredByCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: form.name,
      phone: form.phone,
      password: form.password,
    };
    if (form.birthDate) body.birthDate = form.birthDate;
    if (form.gender) body.gender = form.gender;
    if (form.postalCode) body.postalCode = form.postalCode;
    if (form.addressLine1) body.addressLine1 = form.addressLine1;
    if (form.addressLine2) body.addressLine2 = form.addressLine2;
    if (form.referredByCode) body.referredByCode = form.referredByCode;

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error === 'PHONE_TAKEN' ? '이미 가입된 번호입니다' : '가입 실패');
      return;
    }
    router.replace('/customer');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <header>
          <h1 className="text-xl font-bold">회원가입</h1>
          <p className="mt-1 text-sm text-gray-500">Funnyview Pickup · 고객</p>
        </header>

        <SocialButtons />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-gray-400">또는 전화번호로 가입</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="이름"
            name="name"
            required
            autoComplete="name"
            enterKeyHint="next"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
          <Input
            label="휴대전화번호"
            name="phone"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder="01012345678"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value.replace(/\D/g, ''))}
            hint="아이디로 사용됩니다"
          />
          <Input
            label="비밀번호"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            enterKeyHint="next"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            hint="8자 이상"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="생년월일"
              name="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => update('birthDate', e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">성별</label>
              <select
                value={form.gender}
                onChange={(e) => update('gender', e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
              >
                <option value="">선택</option>
                <option value="female">여성</option>
                <option value="male">남성</option>
                <option value="other">기타</option>
              </select>
            </div>
          </div>
          <Input
            label="우편번호"
            name="postalCode"
            value={form.postalCode}
            onChange={(e) => update('postalCode', e.target.value)}
          />
          <Input
            label="주소"
            name="addressLine1"
            value={form.addressLine1}
            onChange={(e) => update('addressLine1', e.target.value)}
          />
          <Input
            label="상세주소"
            name="addressLine2"
            value={form.addressLine2}
            onChange={(e) => update('addressLine2', e.target.value)}
          />
          <Input
            label="추천인 코드 (선택)"
            name="referredByCode"
            value={form.referredByCode}
            onChange={(e) => update('referredByCode', e.target.value.toUpperCase())}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '가입 중...' : '가입하기'}
          </Button>
        </form>

        <div className="text-center text-sm">
          <Link href="/login" className="text-brand-600 hover:underline">
            이미 회원이신가요? 로그인
          </Link>
        </div>
      </div>
    </main>
  );
}
