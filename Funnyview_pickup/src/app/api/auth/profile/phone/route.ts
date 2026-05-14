import { NextResponse } from 'next/server';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { customers, users } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

const schema = z.object({
  phone: z.string().regex(/^01[016789]\d{7,8}$/, '휴대전화번호 형식 오류'),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 다른 활성 사용자가 같은 번호를 쓰고 있는지 검사
  const conflict = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.phone, parsed.data.phone),
        isNull(users.deletedAt),
        ne(users.id, user.id),
      ),
    )
    .limit(1);
  if (conflict[0]) {
    return NextResponse.json({ error: 'PHONE_TAKEN' }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ phone: parsed.data.phone, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx
      .update(customers)
      .set({ phone: parsed.data.phone, updatedAt: new Date() })
      .where(eq(customers.userId, user.id));
  });

  return NextResponse.json({ ok: true });
}
