import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, notifications, users } from '@/db/schema';
import { getActiveSender } from './channels';
import { notifyUser } from './publish';
import {
  type NotificationKind,
  type TemplateContext,
  renderTemplate,
} from './templates';

export interface DispatchInput {
  kind: NotificationKind;
  recipients: Array<{
    userId: string;
    phone?: string | null;
    preferKakao?: boolean;
  }>;
  context: TemplateContext;
  referenceType?: 'order' | 'inventory';
  referenceId?: string;
}

/**
 * 알림 1건을 1) DB 로깅 2) 인앱(SSE) 3) 외부 채널(SMS/카카오) 모두 전송.
 *
 * - 인앱(app): 항상 notifications row + Redis pub
 * - SMS/카카오: 외부 채널 전송 + 성공/실패에 따라 status 갱신
 *
 * 실패해도 비즈니스 로직(주문 등)에는 영향 없음.
 */
export async function dispatchNotification(input: DispatchInput) {
  const tpl = renderTemplate(input.kind, input.context);
  const sender = getActiveSender();

  for (const r of input.recipients) {
    // 1) 인앱 row
    const [appRow] = await db
      .insert(notifications)
      .values({
        recipientUserId: r.userId,
        notificationType: input.kind,
        channel: 'app',
        status: 'sent',
        title: tpl.title,
        body: tpl.body,
        payload: input.context as Record<string, unknown>,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        sentAt: new Date(),
      })
      .returning({ id: notifications.id });

    // 2) SSE 푸시
    try {
      await notifyUser(r.userId, {
        type: input.kind,
        title: tpl.title,
        body: tpl.body,
        orderId: input.referenceType === 'order' ? input.referenceId : undefined,
        ts: Date.now(),
      });
    } catch {
      // ignore
    }

    // 3) 외부 채널 — 전화번호 있는 경우만
    if (!r.phone) continue;

    const useKakao = r.preferKakao !== false && !!tpl.kakaoTemplateId && !!sender.sendAlimtalk;
    const channel = useKakao ? 'kakao' : 'sms';
    const [extRow] = await db
      .insert(notifications)
      .values({
        recipientUserId: r.userId,
        notificationType: input.kind,
        channel: channel as 'sms' | 'kakao',
        status: 'pending',
        title: tpl.title,
        body: tpl.body,
        payload: input.context as Record<string, unknown>,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      })
      .returning({ id: notifications.id });

    try {
      const result = useKakao
        ? await sender.sendAlimtalk!({
            to: r.phone,
            title: tpl.title,
            body: tpl.body,
            templateId: tpl.kakaoTemplateId,
            templateVariables: tpl.kakaoVariables,
          })
        : await sender.sendSms({ to: r.phone, title: tpl.title, body: tpl.body });

      await db
        .update(notifications)
        .set({
          status: result.ok ? 'sent' : 'failed',
          sentAt: result.ok ? new Date() : null,
          failedReason: result.failedReason ?? null,
          payload: sql`COALESCE(${notifications.payload}, '{}'::jsonb) || ${JSON.stringify({ providerMessageId: result.providerMessageId })}::jsonb`,
        })
        .where(eq(notifications.id, extRow.id));
    } catch (e) {
      await db
        .update(notifications)
        .set({
          status: 'failed',
          failedReason: e instanceof Error ? e.message : 'unknown',
        })
        .where(eq(notifications.id, extRow.id));
    }
    // appRow 는 별도 처리 불필요 (이미 sent)
    void appRow;
  }
}

/**
 * userId 로부터 (phone, customerName) 조회.
 * dispatchNotification 호출 직전 보조용.
 */
export async function resolveRecipient(userId: string): Promise<{
  userId: string;
  phone: string | null;
  customerName?: string;
}> {
  const u = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u[0]) return { userId, phone: null };
  const c = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.userId, userId))
    .limit(1);
  return { userId, phone: u[0].phone, customerName: c[0]?.name };
}
