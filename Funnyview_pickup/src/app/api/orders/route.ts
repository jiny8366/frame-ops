import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { orderItems, orders, stores } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import { createOrder, OrderCreationError } from '@/lib/orders/create-order';
import { markPaid } from '@/lib/orders/transitions';

export const dynamic = 'force-dynamic';

const createOrderSchema = z.object({
  pickupStoreId: z.string().uuid(),
  customerNote: z.string().optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        eyeSide: z.enum(['left', 'right', 'both']),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  // 결제 (Phase 3: mock — 카드/현금 표시만)
  payOnline: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'customer' || !user.customerId) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const parsed = createOrderSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const order = await createOrder({
      customerId: user.customerId,
      pickupStoreId: parsed.data.pickupStoreId,
      customerNote: parsed.data.customerNote,
      lines: parsed.data.lines,
    });

    // mock: 온라인 선결제 처리
    if (parsed.data.payOnline) {
      await markPaid(order.id, user.id);
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (e) {
    if (e instanceof OrderCreationError) {
      return NextResponse.json(
        { error: e.code, message: e.message, detail: e.detail },
        { status: 400 },
      );
    }
    throw e;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      shippedAt: orders.shippedAt,
      readyAt: orders.readyAt,
      completedAt: orders.completedAt,
      storeName: stores.name,
      storePhone: stores.phone,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id})`,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.pickupStoreId))
    .where(eq(orders.customerId, user.customerId))
    .orderBy(desc(orders.createdAt));

  return NextResponse.json({ orders: rows });
}
