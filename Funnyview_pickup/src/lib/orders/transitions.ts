import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  inventory,
  inventoryMovements,
  notifications,
  orderItems,
  orderStatusHistory,
  orders,
  users,
} from '@/db/schema';
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

/**
 * 출고 처리: 재고 reserved -> on_hand 차감 + inventory_movements 'outbound' 기록.
 * 고객/가맹점 화면에 '배송 중' 으로 노출.
 */
export async function markShipped(orderId: string, byUserId: string) {
  await db.transaction(async (tx) => {
    const row = await tx
      .select({ status: orders.status, storeId: orders.pickupStoreId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    const current = row[0];
    if (!current) {
      throw new TransitionError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다');
    }
    if (current.status !== 'picking') {
      throw new TransitionError(
        'INVALID_TRANSITION',
        `${current.status} → shipped 전이 불가`,
      );
    }

    const items = await tx
      .select({
        variantId: orderItems.variantId,
        quantity: orderItems.quantity,
      })
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

  // 고객 + 가맹점 직원에 알림 (out-of-tx)
  try {
    const ord = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
        pickupStoreId: orders.pickupStoreId,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (ord[0]) {
      const recipients: string[] = [];
      // 고객 user
      const customerUser = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(sql`customers`, sql`customers.user_id = ${users.id}`)
        .where(sql`customers.id = ${ord[0].customerId}`)
        .limit(1);
      if (customerUser[0]) recipients.push(customerUser[0].id);

      // 가맹점 직원들
      const staff = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.role, 'store_staff'), eq(users.storeId, ord[0].pickupStoreId)),
        );
      for (const s of staff) recipients.push(s.id);

      if (recipients.length > 0) {
        await db.insert(notifications).values(
          recipients.map((uid) => ({
            recipientUserId: uid,
            notificationType: 'order_shipped' as const,
            channel: 'app' as const,
            title: '배송 시작',
            body: `주문 ${ord[0].orderNumber} 배송 중`,
            referenceType: 'order',
            referenceId: ord[0].id,
          })),
        );
      }
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

  // 고객에게 픽업 가능 알림
  try {
    const ord = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerId: orders.customerId,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (ord[0]) {
      const customerUser = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(sql`customers`, sql`customers.user_id = ${users.id}`)
        .where(sql`customers.id = ${ord[0].customerId}`)
        .limit(1);
      if (customerUser[0]) {
        await db.insert(notifications).values({
          recipientUserId: customerUser[0].id,
          notificationType: 'pickup_ready',
          channel: 'app',
          title: '픽업 가능',
          body: `주문 ${ord[0].orderNumber} 가 가맹점에 도착했습니다`,
          referenceType: 'order',
          referenceId: ord[0].id,
        });
      }
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
}

export async function cancelOrder(orderId: string, byUserId: string | null, reason: string) {
  // 재고 예약 해제 (pending/paid/accepted/picking 단계에서만)
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
}
