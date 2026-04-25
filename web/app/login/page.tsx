// Frame Ops Web — 로그인 페이지
// 지점 코드 + 직원 비밀번호 → /api/auth/login → 성공 시 next 또는 / 로 이동.

'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { mutate } from 'swr';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/';

  const defaultStoreCode = process.env.NEXT_PUBLIC_DEFAULT_STORE_CODE ?? '';
  const [storeCode, setStoreCode] = useState(defaultStoreCode);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_code: storeCode.trim(), password }),
        });
        const json = (await res.json()) as { data: unknown; error: string | null };
        if (!res.ok || json.error) {
          setError(json.error ?? '로그인에 실패했습니다.');
          setSubmitting(false);
          return;
        }
        // /api/auth/me SWR 캐시 갱신
        await mutate('/api/auth/me');
        router.replace(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : '네트워크 오류');
        setSubmitting(false);
      }
    },
    [storeCode, password, submitting, router, next]
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] safe-padding p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] flex flex-col gap-4 rounded-2xl bg-[var(--color-bg-secondary)] p-6 shadow-sm"
      >
        <div className="flex flex-col gap-1 text-center">
          <span className="text-largeTitle">👓</span>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            Frame Ops 로그인
          </h1>
          <p className="text-caption1 text-[var(--color-label-secondary)]">
            지점 코드와 본인 비밀번호를 입력하세요
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-callout text-[var(--color-label-secondary)]">지점 코드</span>
          {/* 영문 키보드 기본: pattern + lang="en" + autoCapitalize="characters" 조합 (iOS/Android) */}
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            lang="en"
            pattern="[A-Za-z0-9]*"
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            placeholder="예: BKC01"
            className="rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-4 py-3 text-body focus:border-[var(--color-system-blue)] focus:outline-none"
            required
            autoFocus={!defaultStoreCode}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-callout text-[var(--color-label-secondary)]">비밀번호</span>
          {/* 숫자 키보드 기본: type=password 마스킹 + inputMode=numeric (iOS/Android) */}
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-[var(--color-separator-opaque)] bg-[var(--color-bg-primary)] px-4 py-3 text-body focus:border-[var(--color-system-blue)] focus:outline-none"
            required
            autoFocus={!!defaultStoreCode}
          />
        </label>

        {error && (
          <p className="text-caption1 text-[var(--color-system-red)] text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !storeCode.trim() || !password}
          className="pressable touch-target-lg rounded-xl bg-[var(--color-system-blue)] py-3 text-headline font-semibold text-white disabled:opacity-40"
        >
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  );
}
