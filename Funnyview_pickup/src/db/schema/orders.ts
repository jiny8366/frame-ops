import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { eyeSideEnum, orderStatusEnum } from './enums';
import { lensVariants } from './lenses';
import { stores } from './stores';
import { users } from './users';

/**
 * 주문 마스터.
 * 상태 전이 시각은 별도 컬럼으로 보존 (회계/분석 편의).
 * 상세 전이 이력은 order_status_history 에 누적.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: text('order_number').notNull(), // 사용자 친화 번호 (FV20260514-0001)
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    pickupStoreId: uuid('pickup_store_id')
      .notNull()
      .references(() => stores.id),

    status: orderStatusEnum('status').default('pending').notNull(),

    // 금액 (원)
    subtotal: integer('subtotal').notNull(),
    discount: integer('discount').default(0).notNull(),
    total: integer('total').notNull(),

    // 결제 처리 여부 (요약 플래그 — 실제 결제는 payments 테이블에 N건)
    isPaid: integer('is_paid').default(0).notNull(), // 0/1 (단순 플래그)

    customerNote: text('customer_note'),
    internalNote: text('internal_note'),

    // 상태 전이 타임스탬프
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    pickingAt: timestamp('picking_at', { withTimezone: true }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }), // 도착알림 발송 시각
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orderNumberUnique: uniqueIndex('orders_order_number_unique').on(
      t.orderNumber,
    ),
    customerIdx: index('orders_customer_idx').on(t.customerId, t.createdAt),
    storeIdx: index('orders_store_idx').on(t.pickupStoreId, t.status),
    statusIdx: index('orders_status_idx').on(t.status, t.createdAt),
    createdAtIdx: index('orders_created_at_idx').on(t.createdAt),
    totalNonNegative: check(
      'orders_total_non_negative',
      sql`${t.total} >= 0`,
    ),
  }),
);

/**
 * 주문 라인 — 좌/우/양안 별 행.
 * lens_name 등 스냅샷 컬럼은 마스터 변경 후에도 거래명세서 재현 보장.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => lensVariants.id),
    eyeSide: eyeSideEnum('eye_side').notNull(), // left / right / both
    quantity: integer('quantity').notNull(), // 박스 수
    unitPrice: integer('unit_price').notNull(),
    lineTotal: integer('line_total').notNull(), // quantity * unit_price (앱에서 계산 저장)

    // 스냅샷 (마스터 변경 무관)
    lensName: text('lens_name').notNull(),
    lensBrand: text('lens_brand').notNull(),
    sphere: numeric('sphere', { precision: 4, scale: 2 }).notNull(),
    cylinder: numeric('cylinder', { precision: 4, scale: 2 }),
    axis: integer('axis'),
    addPower: numeric('add_power', { precision: 4, scale: 2 }),
    skuSnapshot: text('sku_snapshot').notNull(),
    barcodeSnapshot: text('barcode_snapshot'),

    // 비용 스냅샷 (영업이익 계산)
    unitCost: integer('unit_cost'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orderIdx: index('order_items_order_idx').on(t.orderId),
    variantIdx: index('order_items_variant_idx').on(t.variantId),
    quantityPositive: check(
      'order_items_quantity_positive',
      sql`${t.quantity} > 0`,
    ),
  }),
);

/**
 * 주문 상태 전이 이력 (Append-only).
 * 누가 / 언제 / 어떤 상태로 변경했는지 감사.
 */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    changedBy: uuid('changed_by').references(() => users.id),
    note: text('note'),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orderIdx: index('order_status_history_order_idx').on(
      t.orderId,
      t.changedAt,
    ),
  }),
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
