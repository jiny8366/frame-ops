import { NextResponse } from 'next/server';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  homeSections,
  inventory,
  lensVariants,
  lenses,
} from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * 공개 홈 섹션 조회.
 * - is_active = true
 * - starts_at IS NULL OR starts_at <= now()
 * - ends_at IS NULL OR ends_at >= now()
 * - deleted_at IS NULL
 *
 * product_grid 섹션은 lens 목록을 hydrate.
 */
export async function GET() {
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

  // product_grid hydrate
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
            lensType: lenses.lensType,
            replacementCycle: lenses.replacementCycle,
            piecesPerBox: lenses.piecesPerBox,
            price: lenses.price,
            imageUrl: lenses.imageUrl,
          })
          .from(lenses)
          .where(
            and(eq(lenses.isActive, true), sql`${lenses.id} = ANY(${cfg.lensIds})`),
          )
          .limit(limit);
      } else {
        // best/new/trending — 단순화: 활성 렌즈 중 가용재고 합이 큰 순 (best),
        // 또는 createdAt desc (new), 또는 최근 7일 주문 라인 합 (trending).
        // 기본은 best.
        lensRows = await db
          .select({
            id: lenses.id,
            brand: lenses.brand,
            name: lenses.name,
            lensType: lenses.lensType,
            replacementCycle: lenses.replacementCycle,
            piecesPerBox: lenses.piecesPerBox,
            price: lenses.price,
            imageUrl: lenses.imageUrl,
            available: sql<number>`COALESCE(SUM(${inventory.quantityOnHand} - ${inventory.quantityReserved}), 0)`,
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

  return NextResponse.json({ sections: hydrated });
}
