import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { orders } from './orders';

/**
 * 추천인 리워드.
 * customer A 가 customer B 를 추천 → B 의 첫 주문(또는 매 주문) 완료 시
 *   A 에게 일정 금액(또는 비율) 리워드.
 *
 * status:
 *   pending  — 발생했으나 정산 대기
 *   accrued  — 적립됨(사용 가능)
 *   redeemed — 사용됨(차감)
 *   void     — 취소(주문 취소 등)
 */
export const referralRewards = pgTable(
  'referral_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerId: uuid('referrer_id')
      .notNull()
      .references(() => customers.id),
    refereeId: uuid('referee_id')
      .notNull()
      .references(() => customers.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    rewardAmount: integer('reward_amount').notNull(), // 원 (포인트 단위)
    status: text('status').notNull().default('pending'),
    accruedAt: timestamp('accrued_at', { withTimezone: true }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    orderUnique: uniqueIndex('referral_rewards_order_unique').on(t.orderId),
    referrerIdx: index('referral_rewards_referrer_idx').on(t.referrerId, t.status),
    refereeIdx: index('referral_rewards_referee_idx').on(t.refereeId),
  }),
);

export type ReferralReward = typeof referralRewards.$inferSelect;
export type NewReferralReward = typeof referralRewards.$inferInsert;
