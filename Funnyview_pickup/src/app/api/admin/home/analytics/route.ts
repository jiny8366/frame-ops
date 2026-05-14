import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { homeSectionEvents, homeSections } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get('days') ?? 7);
  const days = Math.min(Math.max(daysParam, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      sectionId: homeSections.id,
      kind: homeSections.kind,
      title: homeSections.title,
      isActive: homeSections.isActive,
      impressions: sql<number>`COUNT(*) FILTER (WHERE ${homeSectionEvents.eventType} = 'impression')::int`,
      clicks: sql<number>`COUNT(*) FILTER (WHERE ${homeSectionEvents.eventType} = 'click')::int`,
      conversions: sql<number>`COUNT(*) FILTER (WHERE ${homeSectionEvents.eventType} = 'conversion')::int`,
    })
    .from(homeSections)
    .leftJoin(
      homeSectionEvents,
      and(
        eq(homeSectionEvents.sectionId, homeSections.id),
        sql`${homeSectionEvents.occurredAt} >= ${since}`,
      ),
    )
    .groupBy(homeSections.id)
    .orderBy(homeSections.sortOrder);

  return NextResponse.json({
    days,
    sections: rows.map((r) => ({
      ...r,
      ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
      cvr: r.clicks > 0 ? r.conversions / r.clicks : 0,
    })),
  });
}
