import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { orders, payments } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import {
  TransitionError,
  markArrived,
  markCompleted,
  markReady,
} from '@/lib/orders/transitions';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['arrive', 'ready', 'complete']),
  payment: z
    .object({
      method: z.enum(['card', 'cash', 'bank_transfer', 'point', 'mixed']),
      amount: z.number().int().positive(),
    })
    .optional(),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'store_staff' && user.role !== 'admin')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // 가맹점 직원은 본인 storeId 의 주문만 처리 가능
  const ord = await db
    .select({ pickupStoreId: orders.pickupStoreId, isPaid: orders.isPaid })
    .from(orders)
    .where(eq(orders.id, ctx.params.id))
    .limit(1);
  if (!ord[0]) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (user.role === 'store_staff' && ord[0].pickupStoreId !== user.storeId) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case 'arrive':
        await markArrived(ctx.params.id, user.id);
        break;
      case 'ready':
        await markReady(ctx.params.id, user.id);
        break;
      case 'complete': {
        // 매장 결제 처리: payment 가 전달되면 record 생성
        if (parsed.data.payment) {
          await db.insert(payments).values({
            orderId: ctx.params.id,
            storeId: user.storeId,
            amount: parsed.data.payment.amount,
            method: parsed.data.payment.method,
            venue: 'store',
            status: 'completed',
            paidAt: new Date(),
            collectedBy: user.id,
          });
        }
        await markCompleted(ctx.params.id, user.id);
        break;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TransitionError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    }
    throw e;
  }
}
