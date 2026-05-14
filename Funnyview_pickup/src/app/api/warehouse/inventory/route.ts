import { NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { inventory, inventoryMovements, lensVariants, lenses } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'warehouse_staff' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const onlyLow = url.searchParams.get('low') === '1';

  const rows = await db
    .select({
      inventoryId: inventory.id,
      variantId: lensVariants.id,
      sku: lensVariants.sku,
      brand: lenses.brand,
      lensName: lenses.name,
      sphere: lensVariants.sphere,
      cylinder: lensVariants.cylinder,
      axis: lensVariants.axis,
      addPower: lensVariants.addPower,
      onHand: inventory.quantityOnHand,
      reserved: inventory.quantityReserved,
      safetyStock: inventory.safetyStock,
      reorderPoint: inventory.reorderPoint,
      available: sql<number>`${inventory.quantityOnHand} - ${inventory.quantityReserved}`,
      isLow: sql<boolean>`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) < GREATEST(${inventory.safetyStock}, ${inventory.reorderPoint})`,
    })
    .from(inventory)
    .innerJoin(lensVariants, eq(lensVariants.id, inventory.variantId))
    .innerJoin(lenses, eq(lenses.id, lensVariants.lensId))
    .where(
      onlyLow
        ? sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) < GREATEST(${inventory.safetyStock}, ${inventory.reorderPoint})`
        : sql`TRUE`,
    )
    .orderBy(asc(lenses.brand), asc(lenses.name), asc(lensVariants.sphere));

  return NextResponse.json({ inventory: rows });
}

const adjustSchema = z.object({
  variantId: z.string().uuid(),
  delta: z.number().int(), // 양수: 입고, 음수: 조정 차감
  note: z.string().optional(),
});

/**
 * 입고/재고조정.
 * 단순 모델: 변경량(delta)을 quantity_on_hand 에 가산 + inventory_movements 기록.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'warehouse_staff' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = adjustSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }
  const { variantId, delta, note } = parsed.data;
  if (delta === 0) {
    return NextResponse.json({ error: 'NO_CHANGE' }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: inventory.id })
      .from(inventory)
      .where(eq(inventory.variantId, variantId))
      .limit(1);

    if (existing[0]) {
      await tx
        .update(inventory)
        .set({
          quantityOnHand: sql`${inventory.quantityOnHand} + ${delta}`,
          lastCountedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventory.variantId, variantId));
    } else {
      await tx.insert(inventory).values({
        variantId,
        quantityOnHand: delta,
        quantityReserved: 0,
        safetyStock: 0,
        reorderPoint: 0,
      });
    }

    await tx.insert(inventoryMovements).values({
      variantId,
      movementType: delta > 0 ? 'inbound' : 'adjust',
      quantity: delta,
      note,
      performedBy: user.id,
    });
  });

  return NextResponse.json({ ok: true });
}
