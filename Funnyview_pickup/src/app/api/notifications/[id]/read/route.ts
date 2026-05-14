import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  await db
    .update(notifications)
    .set({ readAt: new Date(), status: 'read' })
    .where(
      and(
        eq(notifications.id, ctx.params.id),
        eq(notifications.recipientUserId, user.id),
      ),
    );
  return NextResponse.json({ ok: true });
}
