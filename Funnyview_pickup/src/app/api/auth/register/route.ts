import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { customers, users } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  name: z.string().min(2).max(30),
  phone: z
    .string()
    .regex(/^01[016789]\d{7,8}$/, '휴대전화번호 형식이 올바르지 않습니다'),
  password: z.string().min(8).max(72),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식')
    .optional(),
  postalCode: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  referredByCode: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = registerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, input.phone), isNull(users.deletedAt)))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: 'PHONE_TAKEN' }, { status: 409 });
  }

  let referrerId: string | null = null;
  if (input.referredByCode) {
    const ref = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.referrerCode, input.referredByCode))
      .limit(1);
    referrerId = ref[0]?.id ?? null;
  }

  const passwordHash = await hashPassword(input.password);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        phone: input.phone,
        passwordHash,
        role: 'customer',
      })
      .returning({ id: users.id });

    const [customer] = await tx
      .insert(customers)
      .values({
        userId: user.id,
        name: input.name,
        phone: input.phone,
        gender: input.gender,
        birthDate: input.birthDate,
        postalCode: input.postalCode,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        referredByCode: input.referredByCode,
        referredById: referrerId,
        referrerCode: 'FV' + user.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      })
      .returning({ id: customers.id });

    return { userId: user.id, customerId: customer.id };
  });

  await setSessionCookie({ uid: created.userId, role: 'customer' });

  return NextResponse.json({
    ok: true,
    userId: created.userId,
    customerId: created.customerId,
  });
}
