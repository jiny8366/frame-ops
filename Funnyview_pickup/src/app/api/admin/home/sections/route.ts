import { NextResponse } from 'next/server';
import { and, asc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { homeSections } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  defaultConfig,
  type SectionKind,
} from '@/lib/home/section-config';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return null;
  }
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const rows = await db
    .select()
    .from(homeSections)
    .where(isNull(homeSections.deletedAt))
    .orderBy(asc(homeSections.sortOrder), asc(homeSections.createdAt));

  return NextResponse.json({ sections: rows });
}

const createSchema = z.object({
  kind: z.enum([
    'hero',
    'product_grid',
    'category_chips',
    'banner_strip',
    'countdown',
    'brand_story',
  ]),
  title: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  const kind = parsed.data.kind as SectionKind;
  const config = parsed.data.config ?? defaultConfig(kind);

  const [row] = await db
    .insert(homeSections)
    .values({
      kind,
      title: parsed.data.title,
      config,
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: parsed.data.isActive ?? true,
      createdBy: user.id,
    })
    .returning();

  return NextResponse.json({ section: row });
}
