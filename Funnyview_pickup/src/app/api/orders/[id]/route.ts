import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  customers,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  stores,
} from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import { mapLinks } from '@/lib/utils/map-url';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const rows = await db
    .select({
      order: orders,
      customer: customers,
      store: stores,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stores, eq(stores.id, orders.pickupStoreId))
    .where(eq(orders.id, ctx.params.id))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // 권한: 본인 주문 / 가맹점 직원(해당 가맹점) / warehouse / admin
  const allowed =
    user.role === 'admin' ||
    user.role === 'warehouse_staff' ||
    (user.role === 'customer' && user.customerId === row.customer.id) ||
    (user.role === 'store_staff' && user.storeId === row.store.id);
  if (!allowed) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, row.order.id))
    .orderBy(asc(orderItems.eyeSide));

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, row.order.id))
    .orderBy(asc(orderStatusHistory.changedAt));

  const paymentsRows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, row.order.id))
    .orderBy(asc(payments.createdAt));

  return NextResponse.json({
    order: row.order,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      phone: row.customer.phone,
    },
    store: {
      id: row.store.id,
      name: row.store.name,
      phone: row.store.phone,
      address: [row.store.addressLine1, row.store.addressLine2].filter(Boolean).join(' '),
      mapLinks: mapLinks(row.store),
    },
    items,
    history,
    payments: paymentsRows,
  });
}
