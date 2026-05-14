import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  customers,
  inventory,
  inventoryMovements,
  orderItems,
  orderStatusHistory,
  orders,
  stores,
  users,
} from '@/db/schema';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import {
  accrueReferralRewardOnComplete,
  voidReferralRewardOnCancel,
} from '@/lib/referral/accrue';
import type { OrderStatus } from '@/types/order';

export class TransitionError extends Error {
  constructor(
    public code: 'INVALID_TRANSITION' | 'ORDER_NOT_FOUND' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

const ALLOWED_FROM: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['accepted', 'cancelled'],
  accepted: ['picking', 'cancelled'],
  picking: ['shipped', 'cancelled'],
  shipped: ['arrived'],
  arrived: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

async function transition(
  orderId: string,
  to: OrderStatus,
  byUserId: string | null,
  setters: Partial<typeof orders.$inferInsert>,
  note?: string,
) {
  const result = await db.transaction(async (tx) => {
    const row = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const current = row[0];
    if (!current) {
      throw new TransitionError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    }
    const allowed = ALLOWED_FROM[current.status as OrderStatus] ?? [];
    if (!allowed.includes(to)) {
      throw new TransitionError(
        'INVALID_TRANSITION',
        `${current.status} → ${to} 전이는 허용되지 않습니다`,
      );
    }

    await tx
      .update(orders)
      .set({ ...setters, status: to, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: current.status as OrderStatus,
      toStatus: to,
      changedBy: byUserId,
      note,
    });

    return { from: current.status as OrderStatus, to };
  });
  return result;
}

async function orderSummary(orderId: string) {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      customerUserId: users.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      storeId: stores.id,
      storeName: stores.name,
      storeAddress: stores.addressLine1,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(users, eq(users.id, customers.userId))
    .innerJoin(stores, eq(stores.id, orders.pickupStoreId))
    .where(eq(orders.id, orderId))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPaid(orderId: string, byUserId: string | null) {
  await transition(orderId, 'paid', byUserId, {
    paidAt: new Date(),
    isPaid: 1,
  });
}

export async function markAccepted(orderId: string, byUserId: string) {
  await transition(orderId, 'accepted', byUserId, { acceptedAt: new Date() });
}

export async function markPicking(orderId: string, byUserId: string) {
  await transition(orderId, 'picking', byUserId, { pickingAt: new Date() });
}

export async function markShipped(orderId: string, byUserId: string) {
  await db.transaction(async (tx) => {
    const row = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const current = row[0];
    if (!current) throw new TransitionError('ORDER_NOT_FOUND', '주문 없음');
    if (current.status !== 'picking') {
      throw new TransitionError(
        'INVALID_TRANSITION',
        `${current.status} → shipped 전이 불가`,
      );
    }

    const items = await tx
      .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    for (const it of items) {
      await tx
        .update(inventory)
        .set({
          quantityOnHand: sql`${inventory.quantityOnHand} - ${it.quantity}`,
          quantityReserved: sql`${inventory.quantityReserved} - ${it.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(inventory.variantId, it.variantId));
      await tx.insert(inventoryMovements).values({
        variantId: it.variantId,
        movementType: 'outbound',
        quantity: -it.quantity,
        referenceType: 'order',
        referenceId: orderId,
        performedBy: byUserId,
      });
    }

    await tx
      .update(orders)
      .set({ status: 'shipped', shippedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: 'picking',
      toStatus: 'shipped',
      changedBy: byUserId,
    });
  });

  // 고객 + 가맹점 직원에 'order_shipped' 알림
  try {
    const summary = await orderSummary(orderId);
    if (summary) {
      const staff = await db
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(and(eq(users.role, 'store_staff'), eq(users.storeId, summary.storeId)));
      await dispatchNotification({
        kind: 'order_shipped',
        recipients: [
          { userId: summary.customerUserId, phone: summary.customerPhone, preferKakao: true },
          ...staff.map((s) => ({ userId: s.id, phone: s.phone })),
        ],
        context: {
          orderNumber: summary.orderNumber,
          customerName: summary.customerName,
          storeName: summary.storeName,
        },
        referenceType: 'order',
        referenceId: orderId,
      });
    }
  } catch {
    // ignore
  }
}

export async function markArrived(orderId: string, byUserId: string) {
  await transition(orderId, 'arrived', byUserId, { arrivedAt: new Date() });
}

export async function markReady(orderId: string, byUserId: string) {
  await transition(orderId, 'ready', byUserId, { readyAt: new Date() });

  try {
    const summary = await orderSummary(orderId);
    if (summary) {
      await dispatchNotification({
        kind: 'pickup_ready',
        recipients: [
          {
            userId: summary.customerUserId,
            phone: summary.customerPhone,
            preferKakao: true,
          },
        ],
        context: {
          orderNumber: summary.orderNumber,
          customerName: summary.customerName,
          storeName: summary.storeName,
          storeAddress: summary.storeAddress ?? undefined,
        },
        referenceType: 'order',
        referenceId: orderId,
      });
    }
  } catch {
    // ignore
  }
}

export async function markCompleted(orderId: string, byUserId: string) {
  await transition(orderId, 'completed', byUserId, {
    completedAt: new Date(),
    isPaid: 1,
  });
  await accrueReferralRewardOnComplete(orderId).catch(() => {});
  try {
    const summary = await orderSummary(orderId);
    if (summary) {
      await dispatchNotification({
        kind: 'pickup_completed',
        recipients: [
          {
            userId: summary.customerUserId,
            phone: summary.customerPhone,
            preferKakao: true,
          },
        ],
        context: {
          orderNumber: summary.orderNumber,
          customerName: summary.customerName,
        },
        referenceType: 'order',
        referenceId: orderId,
      });
    }
  } catch {
    // ignore
  }
}

export async function cancelOrder(orderId: string, byUserId: string | null, reason: string) {
  await db.transaction(async (tx) => {
    const row = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const current = row[0];
    if (!current) throw new TransitionError('ORDER_NOT_FOUND', '주문 없음');

    if (
      current.status === 'pending' ||
      current.status === 'paid' ||
      current.status === 'accepted' ||
      current.status === 'picking'
    ) {
      const items = await tx
        .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      for (const it of items) {
        await tx
          .update(inventory)
          .set({
            quantityReserved: sql`${inventory.quantityReserved} - ${it.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(inventory.variantId, it.variantId));
        await tx.insert(inventoryMovements).values({
          variantId: it.variantId,
          movementType: 'release',
          quantity: it.quantity,
          referenceType: 'order',
          referenceId: orderId,
          performedBy: byUserId,
        });
      }
    }

    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: current.status as OrderStatus,
      toStatus: 'cancelled',
      changedBy: byUserId,
      note: reason,
    });
  });
  await voidReferralRewardOnCancel(orderId).catch(() => {});
}

/**
 * 저재고 알림 (warehouse 직원 대상).
 * inventory 변경 후 안전재고 미만이면 호출.
 */
export async function dispatchLowStockAlert(args: {
  variantLabel: string;
  availableQty: number;
  variantId: string;
}) {
  try {
    const warehouseUsers = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.role, 'warehouse_staff'));
    if (warehouseUsers.length === 0) return;
    await dispatchNotification({
      kind: 'low_stock',
      recipients: warehouseUsers.map((u) => ({ userId: u.id, phone: u.phone })),
      context: {
        variantLabel: args.variantLabel,
        availableQty: args.availableQty,
      },
      referenceType: 'inventory',
      referenceId: args.variantId,
    });
  } catch {
    // ignore
  }
}
