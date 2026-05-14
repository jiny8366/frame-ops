import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  inventory,
  inventoryMovements,
  lensVariants,
  lenses,
  orderItems,
  orderStatusHistory,
  orders,
  users,
} from '@/db/schema';
import { invalidateCurationCache } from '@/lib/home/curation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { formatOrderNumber, todayKst } from '@/lib/utils/order-number';

export interface CreateOrderLine {
  variantId: string;
  eyeSide: 'left' | 'right' | 'both';
  quantity: number;
}

export interface CreateOrderInput {
  customerId: string;
  pickupStoreId: string;
  lines: CreateOrderLine[];
  customerNote?: string;
}

export class OrderCreationError extends Error {
  constructor(
    public code:
      | 'NO_LINES'
      | 'VARIANT_NOT_FOUND'
      | 'INSUFFICIENT_STOCK'
      | 'INVALID_QUANTITY',
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export async function createOrder(input: CreateOrderInput) {
  if (!input.lines || input.lines.length === 0) {
    throw new OrderCreationError('NO_LINES', '주문할 상품이 없습니다');
  }
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new OrderCreationError('INVALID_QUANTITY', '수량이 올바르지 않습니다');
    }
  }

  const variantIds = input.lines.map((l) => l.variantId);
  const variantRows = await db
    .select({
      variantId: lensVariants.id,
      sku: lensVariants.sku,
      sphere: lensVariants.sphere,
      cylinder: lensVariants.cylinder,
      axis: lensVariants.axis,
      addPower: lensVariants.addPower,
      priceOverride: lensVariants.priceOverride,
      lensName: lenses.name,
      lensBrand: lenses.brand,
      lensPrice: lenses.price,
      lensCost: lenses.cost,
    })
    .from(lensVariants)
    .innerJoin(lenses, eq(lenses.id, lensVariants.lensId))
    .where(sql`${lensVariants.id} = ANY(${variantIds})`);

  const variantById = new Map(variantRows.map((r) => [r.variantId, r]));
  for (const line of input.lines) {
    if (!variantById.has(line.variantId)) {
      throw new OrderCreationError(
        'VARIANT_NOT_FOUND',
        `렌즈 SKU 를 찾을 수 없습니다: ${line.variantId}`,
      );
    }
  }

  const order = await db.transaction(async (tx) => {
    const today = todayKst();
    const seq = Math.floor(Math.random() * 1_000_000);
    const orderNumber = formatOrderNumber(today, seq);

    let subtotal = 0;
    const itemRows = input.lines.map((line) => {
      const v = variantById.get(line.variantId)!;
      const unitPrice = v.priceOverride ?? v.lensPrice;
      const lineTotal = unitPrice * line.quantity;
      subtotal += lineTotal;
      return { line, v, unitPrice, lineTotal };
    });

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderNumber,
        customerId: input.customerId,
        pickupStoreId: input.pickupStoreId,
        status: 'pending',
        subtotal,
        discount: 0,
        total: subtotal,
        customerNote: input.customerNote,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });

    for (const { line, v, unitPrice, lineTotal } of itemRows) {
      await tx.insert(orderItems).values({
        orderId: createdOrder.id,
        variantId: v.variantId,
        eyeSide: line.eyeSide,
        quantity: line.quantity,
        unitPrice,
        lineTotal,
        lensName: v.lensName,
        lensBrand: v.lensBrand,
        sphere: v.sphere,
        cylinder: v.cylinder,
        axis: v.axis,
        addPower: v.addPower,
        skuSnapshot: v.sku,
        unitCost: v.lensCost,
      });

      const updated = await tx
        .update(inventory)
        .set({
          quantityReserved: sql`${inventory.quantityReserved} + ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inventory.variantId, v.variantId),
            gte(
              sql<number>`${inventory.quantityOnHand} - ${inventory.quantityReserved}`,
              line.quantity,
            ),
          ),
        )
        .returning({ id: inventory.id });

      if (updated.length === 0) {
        throw new OrderCreationError(
          'INSUFFICIENT_STOCK',
          `재고가 부족합니다 (${v.sku})`,
          { variantId: v.variantId },
        );
      }

      await tx.insert(inventoryMovements).values({
        variantId: v.variantId,
        movementType: 'reserve',
        quantity: -line.quantity,
        referenceType: 'order',
        referenceId: createdOrder.id,
      });
    }

    await tx.insert(orderStatusHistory).values({
      orderId: createdOrder.id,
      fromStatus: null,
      toStatus: 'pending',
      note: 'order_created',
    });

    return createdOrder;
  });

  // 큐레이션 캐시 무효화 (trending/best 변동)
  await invalidateCurationCache().catch(() => {});

  // warehouse 직원들에게 알림 (인앱+외부 채널 통합)
  try {
    const warehouseUsers = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.role, 'warehouse_staff'));
    if (warehouseUsers.length > 0) {
      await dispatchNotification({
        kind: 'order_received',
        recipients: warehouseUsers.map((u) => ({
          userId: u.id,
          phone: u.phone,
        })),
        context: { orderNumber: order.orderNumber },
        referenceType: 'order',
        referenceId: order.id,
      });
    }
  } catch {
    // 알림 실패는 무시
  }

  return order;
}
