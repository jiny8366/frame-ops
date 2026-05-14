import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(1),
  expectedRole: z
    .enum(['customer', 'warehouse_staff', 'store_staff', 'admin'])
    .optional(),
});

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const { phone, password, expectedRole } = parsed.data;

  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      storeId: users.storeId,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
    })
    .from(users)
    .where(and(eq(users.phone, phone), isNull(users.deletedAt)))
    .limit(1);

  const user = rows[0];
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: 'INACTIVE_USER' }, { status: 403 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  if (expectedRole && user.role !== expectedRole && user.role !== 'admin') {
    return NextResponse.json({ error: 'ROLE_MISMATCH' }, { status: 403 });
  }

  await setSessionCookie({
    uid: user.id,
    role: user.role,
    storeId: user.storeId,
  });

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    ok: true,
    role: user.role,
    storeId: user.storeId,
  });
}
