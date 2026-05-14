import { publishToUser } from '@/lib/redis/safe';

export interface NotificationEvent {
  type: string; // notificationType
  title: string;
  body: string;
  orderId?: string;
  variantId?: string;
  ts: number;
}

export async function notifyUser(userId: string, event: NotificationEvent) {
  await publishToUser(userId, event as unknown as Record<string, unknown>);
}

export async function notifyMany(userIds: string[], event: NotificationEvent) {
  await Promise.all(userIds.map((uid) => notifyUser(uid, event)));
}
