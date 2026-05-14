import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { homeSectionEvents } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

const schema = z.object({
  events: z
    .array(
      z.object({
        sectionId: z.string().uuid(),
        eventType: z.enum(['impression', 'click', 'conversion']),
        variant: z.string().optional(),
        referenceType: z.string().optional(),
        referenceId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(50),
  sessionId: z.string().optional(),
});

/**
 * 노출/클릭/전환 이벤트 일괄 기록.
 * 익명 사용자도 sessionId 로 추적 가능.
 * 클라이언트에서 IntersectionObserver 로 impression 일괄 전송 권장.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const user = await getCurrentUser();

  const rows = parsed.data.events.map((e) => ({
    sectionId: e.sectionId,
    eventType: e.eventType,
    userId: user?.id,
    sessionId: parsed.data.sessionId,
    variant: e.variant,
    referenceType: e.referenceType,
    referenceId: e.referenceId,
  }));

  await db.insert(homeSectionEvents).values(rows);
  return NextResponse.json({ ok: true, count: rows.length });
}
