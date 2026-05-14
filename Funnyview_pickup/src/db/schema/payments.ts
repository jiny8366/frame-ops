import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  paymentMethodEnum,
  paymentStatusEnum,
  paymentVenueEnum,
} from './enums';
import { orders } from './orders';
import { stores } from './stores';
import { users } from './users';

/**
 * 결제.
 * 1 주문에 N 결제 가능 (예: 일부 카드 + 일부 현금, 또는 환불).
 * venue 로 온라인/매장 결제 구분.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id').references(() => stores.id), // 매장 결제 시 가맹점 ID

    amount: integer('amount').notNull(),
    method: paymentMethodEnum('method').notNull(),
    venue: paymentVenueEnum('venue').notNull(),
    status: paymentStatusEnum('status').default('pending').notNull(),

    // PG 정보
    pgProvider: text('pg_provider'),
    pgTransactionId: text('pg_transaction_id'),
    pgApprovalNumber: text('pg_approval_number'),
    pgRaw: jsonb('pg_raw'), // PG 원본 응답 (감사용)

    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAmount: integer('refunded_amount').default(0).notNull(),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),

    collectedBy: uuid('collected_by').references(() => users.id), // 매장 결제 처리자
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orderIdx: index('payments_order_idx').on(t.orderId),
    statusIdx: index('payments_status_idx').on(t.status),
    paidAtIdx: index('payments_paid_at_idx').on(t.paidAt),
    pgTxnUnique: uniqueIndex('payments_pg_txn_unique')
      .on(t.pgTransactionId)
      .where(sql`pg_transaction_id IS NOT NULL`),
    amountPositive: check('payments_amount_positive', sql`${t.amount} > 0`),
  }),
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
