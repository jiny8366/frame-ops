import { NextResponse } from 'next/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);

  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, user.id),
        unreadOnly ? isNull(notifications.readAt) : sql`TRUE`,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const unreadCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientUserId, user.id),
        isNull(notifications.readAt),
      ),
    );

  return NextResponse.json({
    notifications: rows,
    unreadCount: unreadCount[0]?.count ?? 0,
  });
}
