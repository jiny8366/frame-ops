import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import type { OrderStatus } from '@/types/order';

export const dynamic = 'force-dynamic';

const DEFAULT_STATUSES: OrderStatus[] = ['shipped', 'arrived', 'ready'];

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'store_staff' || !user.storeId) {
    if (user?.role === 'admin') {
      // admin 은 storeId 쿼리 파라미터 강제 필요
      const sid = new URL(req.url).searchParams.get('storeId');
      if (!sid) return NextResponse.json({ error: 'STORE_ID_REQUIRED' }, { status: 400 });
      return queryOrders(sid, req);
    }
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  return queryOrders(user.storeId, req);
}

async function queryOrders(storeId: string, req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const statuses: OrderStatus[] = statusParam
    ? (statusParam.split(',').filter(Boolean) as OrderStatus[])
    : DEFAULT_STATUSES;

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      isPaid: orders.isPaid,
      customerName: customers.name,
      customerPhone: customers.phone,
      shippedAt: orders.shippedAt,
      arrivedAt: orders.arrivedAt,
      readyAt: orders.readyAt,
      completedAt: orders.completedAt,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id})`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.pickupStoreId, storeId), inArray(orders.status, statuses)))
    .orderBy(desc(orders.shippedAt));

  return NextResponse.json({ orders: rows });
}
