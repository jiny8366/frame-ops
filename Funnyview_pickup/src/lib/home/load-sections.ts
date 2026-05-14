import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { homeSections, type HomeSection } from '@/db/schema';
import { type CurationMode, curateLenses } from './curation';

export interface HydratedSection extends HomeSection {
  lenses?: Awaited<ReturnType<typeof curateLenses>>;
}

/**
 * 현재 시각 기준 활성 섹션을 정렬 순으로 반환.
 * product_grid 는 큐레이션 결과로 hydrate.
 */
export async function loadActiveSections(): Promise<HydratedSection[]> {
  const now = new Date();
  const rows = await db
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

  return Promise.all(
    rows.map(async (s): Promise<HydratedSection> => {
      if (s.kind !== 'product_grid') return s;
      const cfg = s.config as {
        mode?: CurationMode;
        lensIds?: string[];
        limit?: number;
      };
      const lenses = await curateLenses(
        cfg.mode ?? 'best',
        cfg.limit ?? 4,
        cfg.lensIds ?? [],
      );
      return { ...s, lenses };
    }),
  );
}
