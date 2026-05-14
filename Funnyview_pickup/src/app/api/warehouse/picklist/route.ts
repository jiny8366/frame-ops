import { NextResponse } from 'next/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { customers, orderItems, orders, stores } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

const schema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
});

/**
 * 픽리스트 데이터 반환.
 * 가맹점별 → SKU별 합산 + 주문별 라인 보존.
 * 클라이언트에서 인쇄 가능한 HTML 로 렌더링.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'warehouse_staff' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  const orderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      storeId: orders.pickupStoreId,
      storeName: stores.name,
      storePhone: stores.phone,
      storeAddress: stores.addressLine1,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.pickupStoreId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(inArray(orders.id, parsed.data.orderIds))
    .orderBy(asc(stores.name), asc(orders.orderNumber));

  const itemRows = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, parsed.data.orderIds))
    .orderBy(asc(orderItems.orderId), asc(orderItems.eyeSide));

  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const it of itemRows) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }

  // SKU 합산
  const skuTotals = new Map<
    string,
    { sku: string; lensName: string; lensBrand: string; quantity: number; rxList: string[] }
  >();
  for (const it of itemRows) {
    const key = it.skuSnapshot;
    const acc = skuTotals.get(key) ?? {
      sku: it.skuSnapshot,
      lensName: it.lensName,
      lensBrand: it.lensBrand,
      quantity: 0,
      rxList: [],
    };
    acc.quantity += it.quantity;
    skuTotals.set(key, acc);
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    operator: { id: user.id, phone: user.phone },
    orders: orderRows.map((o) => ({
      ...o,
      items: itemsByOrder.get(o.id) ?? [],
    })),
    skuTotals: Array.from(skuTotals.values()).sort((a, b) =>
      a.sku.localeCompare(b.sku),
    ),
  });
}
