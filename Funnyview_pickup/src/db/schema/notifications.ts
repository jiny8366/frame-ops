import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  notificationChannelEnum,
  notificationStatusEnum,
  notificationTypeEnum,
} from './enums';
import { users } from './users';

/**
 * 알림 로그.
 * 도착알림(pickup_ready), 배송 시작, 안전재고 부족 등을 통합 관리.
 * 실제 발송은 채널별 큐(SMS/카카오 등)에 위임, 본 테이블은 발송 의도와 상태만 기록.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    notificationType: notificationTypeEnum('notification_type').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationStatusEnum('status').default('pending').notNull(),

    title: text('title').notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload'), // {orderId, variantId, ...}

    // 다형 참조 (조회 편의)
    referenceType: text('reference_type'), // 'order' | 'inventory'
    referenceId: uuid('reference_id'),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedReason: text('failed_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    recipientIdx: index('notifications_recipient_idx').on(
      t.recipientUserId,
      t.createdAt,
    ),
    statusIdx: index('notifications_status_idx').on(t.status, t.createdAt),
    referenceIdx: index('notifications_reference_idx').on(
      t.referenceType,
      t.referenceId,
    ),
  }),
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
