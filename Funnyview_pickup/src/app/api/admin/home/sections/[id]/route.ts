import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { homeSections } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

const patchSchema = z.object({
  title: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  variant: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === 'startsAt' || k === 'endsAt') {
      updates[k] = v ? new Date(v as string) : null;
    } else {
      updates[k] = v;
    }
  }

  const [row] = await db
    .update(homeSections)
    .set(updates)
    .where(eq(homeSections.id, ctx.params.id))
    .returning();

  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ section: row });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  await db
    .update(homeSections)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(homeSections.id, ctx.params.id));

  return NextResponse.json({ ok: true });
}
