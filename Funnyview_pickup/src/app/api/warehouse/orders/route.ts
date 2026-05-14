import { NextResponse } from 'next/server';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, orderItems, orders, stores } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import type { OrderStatus } from '@/types/order';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES: OrderStatus[] = ['paid', 'accepted', 'picking'];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'warehouse_staff' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const statuses: OrderStatus[] = statusParam
    ? (statusParam.split(',').filter(Boolean) as OrderStatus[])
    : ACTIVE_STATUSES;

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      acceptedAt: orders.acceptedAt,
      pickingAt: orders.pickingAt,
      customerName: customers.name,
      customerPhone: customers.phone,
      storeId: orders.pickupStoreId,
      storeName: stores.name,
      storePhone: stores.phone,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stores, eq(stores.id, orders.pickupStoreId))
    .where(inArray(orders.status, statuses))
    .orderBy(desc(orders.createdAt));

  return NextResponse.json({ orders: rows });
}
