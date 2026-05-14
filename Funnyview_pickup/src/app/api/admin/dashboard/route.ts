import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  orderItems,
  orders,
  payments,
  referralRewards,
  stores,
} from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 14), 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // 1) KPI 카드 — 기간 내 매출/주문/완료/평균
  const [kpi] = await db
    .select({
      orderCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
      completedCount: sql<number>`COUNT(DISTINCT ${orders.id}) FILTER (WHERE ${orders.status} = 'completed')::int`,
      grossRevenue: sql<number>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${orders.status} = 'completed'), 0)::int`,
      avgOrder: sql<number>`COALESCE(AVG(${orders.total}) FILTER (WHERE ${orders.status} = 'completed'), 0)::int`,
      cogs: sql<number>`COALESCE(SUM(${orderItems.quantity} * COALESCE(${orderItems.unitCost}, 0)) FILTER (WHERE ${orders.status} = 'completed'), 0)::int`,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(gte(orders.createdAt, since));

  // 2) 일별 매출 차트
  const daily = await db
    .select({
      date: sql<string>`to_char((${orders.completedAt} AT TIME ZONE 'Asia/Seoul')::date, 'YYYY-MM-DD')`,
      revenue: sql<number>`COALESCE(SUM(${orders.total}), 0)::int`,
      orderCount: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.status, 'completed'), gte(orders.completedAt, since)))
    .groupBy(sql`(${orders.completedAt} AT TIME ZONE 'Asia/Seoul')::date`)
    .orderBy(sql`(${orders.completedAt} AT TIME ZONE 'Asia/Seoul')::date`);

  // 3) 가맹점 정산 (수수료율 적용)
  const storeRows = await db
    .select({
      storeId: stores.id,
      storeName: stores.name,
      commissionRate: stores.commissionRate,
      orderCount: sql<number>`COUNT(${orders.id})::int`,
      netRevenue: sql<number>`COALESCE(SUM(${orders.total} - ${orders.discount}), 0)::int`,
    })
    .from(stores)
    .leftJoin(
      orders,
      and(
        eq(orders.pickupStoreId, stores.id),
        eq(orders.status, 'completed'),
        gte(orders.completedAt, since),
      ),
    )
    .groupBy(stores.id)
    .orderBy(sql`COALESCE(SUM(${orders.total} - ${orders.discount}), 0) DESC`);

  // 4) 추천인 리워드 누계
  const [referrer] = await db
    .select({
      totalRewards: sql<number>`COALESCE(SUM(${referralRewards.rewardAmount}) FILTER (WHERE ${referralRewards.status} = 'accrued'), 0)::int`,
      rewardCount: sql<number>`COUNT(*) FILTER (WHERE ${referralRewards.status} = 'accrued')::int`,
      uniqueReferrers: sql<number>`COUNT(DISTINCT ${referralRewards.referrerId}) FILTER (WHERE ${referralRewards.status} = 'accrued')::int`,
    })
    .from(referralRewards)
    .where(gte(referralRewards.createdAt, since));

  // 5) 결제 수단 분포
  const paymentBreakdown = await db
    .select({
      venue: payments.venue,
      method: payments.method,
      count: sql<number>`COUNT(*)::int`,
      amount: sql<number>`COALESCE(SUM(${payments.amount}), 0)::int`,
    })
    .from(payments)
    .where(
      and(eq(payments.status, 'completed'), gte(payments.paidAt, since)),
    )
    .groupBy(payments.venue, payments.method);

  return NextResponse.json({
    days,
    kpi: {
      ...kpi,
      grossProfit: (kpi.grossRevenue ?? 0) - (kpi.cogs ?? 0),
    },
    daily,
    stores: storeRows.map((s) => ({
      ...s,
      commission: Math.floor((s.netRevenue * Number(s.commissionRate ?? '0')) / 100),
    })),
    referral: referrer,
    paymentBreakdown,
  });
}
