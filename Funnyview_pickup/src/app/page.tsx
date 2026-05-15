import Link from 'next/link';
import { SectionRenderer } from '@/components/home/section-renderer';
import { getCurrentUser } from '@/lib/auth/current-user';
import { loadActiveSections } from '@/lib/home/load-sections';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [sections, user] = await Promise.all([
    loadActiveSections().catch(() => []),
    getCurrentUser().catch(() => null),
  ]);

  const myPageHref =
    user?.role === 'customer'
      ? '/customer'
      : user?.role === 'warehouse_staff'
        ? '/warehouse'
        : user?.role === 'store_staff'
          ? '/store'
          : '/admin/dashboard';

  return (
    <main className="min-h-screen bg-white pb-safe">
      <header
        className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3 md:px-6">
          <Link href="/" className="truncate text-base font-bold md:text-lg">
            Funnyview Pickup
          </Link>
          <nav className="flex items-center gap-1.5 text-sm text-gray-600 md:gap-3">
            <Link href="/customer/order" className="hidden hover:text-gray-900 md:inline">
              주문
            </Link>
            {user?.role === 'customer' && (
              <Link href="/customer/orders" className="hidden hover:text-gray-900 md:inline">
                내 주문
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link
                href="/admin/dashboard"
                className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white md:text-xs"
              >
                관리자
              </Link>
            )}
            {user ? (
              <Link
                href={myPageHref}
                className="inline-flex min-h-touch items-center rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-medium text-white md:text-xs"
              >
                마이페이지
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-touch items-center px-2 text-gray-500 hover:text-gray-900"
                >
                  로그인
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-touch items-center rounded-full bg-brand-600 px-3 py-1.5 text-[11px] font-medium text-white md:text-xs"
                >
                  가입
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 md:space-y-6 md:px-6 md:py-10">
        {sections.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 p-16 text-center">
            <h2 className="text-xl font-semibold">홈 화면이 비어있습니다</h2>
            <p className="mt-2 text-sm text-gray-500">
              관리자가 <code className="rounded bg-gray-100 px-1.5 py-0.5">/admin/home</code> 에서 섹션을 구성하세요.
            </p>
          </div>
        ) : (
          sections.map((s) => (
            <SectionRenderer key={s.id} section={s as Parameters<typeof SectionRenderer>[0]['section']} />
          ))
        )}
      </div>

      <footer className="border-t border-gray-200 py-8 text-center text-xs text-gray-400">
        Funnyview Pickup · 콘택트렌즈 픽업서비스
      </footer>
    </main>
  );
}
