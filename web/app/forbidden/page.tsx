// Frame Ops Web — 권한 부족 안내 페이지
// middleware 가 권한 없는 라우트 접근 시 여기로 redirect.
// 쿼리: ?from=<원래 URL>&need=<요구 권한 키>

import Link from 'next/link';
import type { Metadata } from 'next';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: '권한 없음 — Frame Ops' };

interface PageProps {
  searchParams: Promise<{ from?: string; need?: string }>;
}

export default async function ForbiddenPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const from = sp.from ?? '';
  const need = sp.need ?? '';
  const permLabel = ALL_PERMISSIONS.find((p) => p.key === need)?.label ?? need ?? '해당 메뉴';

  return (
    <main className="min-h-screen bg-[var(--color-bg-primary)] safe-padding p-4 flex items-center justify-center">
      <div className="max-w-md w-full rounded-2xl bg-[var(--color-bg-secondary)] p-6 flex flex-col gap-4 text-center">
        <div className="text-5xl" aria-hidden>
          🔒
        </div>
        <div>
          <h1 className="text-title2 font-bold text-[var(--color-label-primary)]">
            접근 권한이 없습니다
          </h1>
          <p className="text-callout text-[var(--color-label-secondary)] mt-2">
            <strong>{permLabel}</strong> 권한이 필요합니다.
          </p>
          {from && (
            <p className="text-caption2 text-[var(--color-label-tertiary)] mt-1 break-all">
              요청 경로: {from}
            </p>
          )}
          <p className="text-caption1 text-[var(--color-label-tertiary)] mt-3">
            본사 관리자에게 권한 부여를 요청하세요.
          </p>
        </div>
        <Link
          href="/"
          className="pressable touch-target rounded-xl bg-[var(--color-system-blue)] text-white text-callout font-semibold px-4 py-2.5"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
