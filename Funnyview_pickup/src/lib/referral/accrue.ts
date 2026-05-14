import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, orders, referralRewards } from '@/db/schema';

/**
 * 정책: 추천받은 고객(referee)의 매 주문 completed 시 추천인(referrer)에게
 *       주문 금액의 REFERRAL_RATE % 적립 (기본 3%, 최대 5,000원)
 *       1 order = 1 reward 행 (uniqueIndex 보장)
 */
const DEFAULT_RATE_PCT = Number(process.env.REFERRAL_RATE_PCT ?? 3);
const DEFAULT_CAP = Number(process.env.REFERRAL_REWARD_CAP ?? 5000);

export async function accrueReferralRewardOnComplete(orderId: string): Promise<void> {
  const rows = await db
    .select({
      orderId: orders.id,
      total: orders.total,
      refereeId: customers.id,
      referrerId: customers.referredById,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.id, orderId), isNotNull(customers.referredById)))
    .limit(1);

  const row = rows[0];
  if (!row || !row.referrerId) return;

  const amount = Math.min(
    Math.floor((row.total * DEFAULT_RATE_PCT) / 100),
    DEFAULT_CAP,
  );
  if (amount <= 0) return;

  // 중복 방지: orderId unique 인덱스 보장. ON CONFLICT 으로 무시.
  await db
    .insert(referralRewards)
    .values({
      referrerId: row.referrerId,
      refereeId: row.refereeId,
      orderId: row.orderId,
      rewardAmount: amount,
      status: 'accrued',
      accruedAt: new Date(),
      note: `${DEFAULT_RATE_PCT}% of order total (cap ${DEFAULT_CAP})`,
    })
    .onConflictDoNothing({ target: referralRewards.orderId });
}

/**
 * 주문 취소 시 적립을 void 처리.
 */
export async function voidReferralRewardOnCancel(orderId: string): Promise<void> {
  await db
    .update(referralRewards)
    .set({ status: 'void', voidedAt: new Date() })
    .where(and(eq(referralRewards.orderId, orderId), sql`${referralRewards.status} != 'redeemed'`));
}
