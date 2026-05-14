import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { stores } from '@/db/schema';
import { mapLinks } from '@/lib/utils/map-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.isActive, true))
    .orderBy(stores.sortOrder, stores.name);

  return NextResponse.json({
    stores: rows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      phone: s.phone,
      address: [s.addressLine1, s.addressLine2].filter(Boolean).join(' '),
      postalCode: s.postalCode,
      mapLinks: mapLinks(s),
    })),
  });
}
