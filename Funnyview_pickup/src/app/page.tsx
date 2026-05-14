import Link from 'next/link';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  homeSections,
  inventory,
  lensVariants,
  lenses,
} from '@/db/schema';
import { SectionRenderer } from '@/components/home/section-renderer';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

async function loadActiveSections() {
  const now = new Date();

  const sections = await db
    .select()
    .from(homeSections)
    .where(
      and(
        eq(homeSections.isActive, true),
        isNull(homeSections.deletedAt),
        or(isNull(homeSections.startsAt), sql`${homeSections.startsAt} <= ${now}`),
        or(isNull(homeSections.endsAt), sql`${homeSections.endsAt} >= ${now}`),
      ),
    )
    .orderBy(asc(homeSections.sortOrder), asc(homeSections.createdAt));

  const hydrated = await Promise.all(
    sections.map(async (s) => {
      if (s.kind !== 'product_grid') return s;
      const cfg = s.config as {
        mode?: 'manual' | 'best' | 'new' | 'trending';
        lensIds?: string[];
        limit?: number;
      };
      const limit = Math.min(cfg.limit ?? 4, 12);
      let lensRows: Array<Record<string, unknown>> = [];

      if (cfg.mode === 'manual' && cfg.lensIds && cfg.lensIds.length > 0) {
        lensRows = await db
          .select({
            id: lenses.id,
            brand: lenses.brand,
            name: lenses.name,
            price: lenses.price,
            imageUrl: lenses.imageUrl,
          })
          .from(lenses)
          .where(
            and(eq(lenses.isActive, true), sql`${lenses.id} = ANY(${cfg.lensIds})`),
          )
          .limit(limit);
      } else {
        lensRows = await db
          .select({
            id: lenses.id,
            brand: lenses.brand,
            name: lenses.name,
            price: lenses.price,
            imageUrl: lenses.imageUrl,
          })
          .from(lenses)
          .leftJoin(lensVariants, eq(lensVariants.lensId, lenses.id))
          .leftJoin(inventory, eq(inventory.variantId, lensVariants.id))
          .where(eq(lenses.isActive, true))
          .groupBy(lenses.id)
          .orderBy(
            cfg.mode === 'new'
              ? sql`${lenses.createdAt} DESC`
              : sql`COALESCE(SUM(${inventory.quantityOnHand} - ${inventory.quantityReserved}), 0) DESC`,
          )
          .limit(limit);
      }
      return { ...s, lenses: lensRows };
    }),
  );
  return hydrated;
}

export default async function Home() {
  const [sections, user] = await Promise.all([
    loadActiveSections().catch(() => []),
    getCurrentUser().catch(() => null),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="text-lg font-bold">
            Funnyview Pickup
          </Link>
          <nav className="flex items-center gap-3 text-sm text-gray-600">
            <Link href="/customer/order" className="hover:text-gray-900">
              주문
            </Link>
            {user?.role === 'customer' && (
              <Link href="/customer/orders" className="hover:text-gray-900">
                내 주문
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link href="/admin/home" className="rounded-full bg-gray-900 px-3 py-1 text-xs text-white">
                관리자
              </Link>
            )}
            {user ? (
              <Link
                href={
                  user.role === 'customer'
                    ? '/customer'
                    : user.role === 'warehouse_staff'
                      ? '/warehouse'
                      : user.role === 'store_staff'
                        ? '/store'
                        : '/admin/home'
                }
                className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
              >
                마이페이지
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-gray-500 hover:text-gray-900">
                  로그인
                </Link>
                <Link href="/register" className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">
                  가입
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-10">
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
