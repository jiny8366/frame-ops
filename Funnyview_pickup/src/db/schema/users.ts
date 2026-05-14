import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

/**
 * 인증/권한용 사용자 마스터.
 * - customer: 1:1 customers 행과 매핑
 * - store_staff: storeId 로 가맹점 소속 식별
 * - warehouse_staff/admin: storeId 없음
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email'),
    phone: text('phone'), // OAuth 가입 직후엔 NULL 가능 (온보딩에서 수집)
    passwordHash: text('password_hash'),
    role: userRoleEnum('role').notNull(),
    storeId: uuid('store_id'), // FK는 relations() 에서 선언 (순환 import 회피)
    isActive: boolean('is_active').default(true).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    phoneIdx: uniqueIndex('users_phone_idx')
      .on(t.phone)
      .where(sql`phone IS NOT NULL AND deleted_at IS NULL`),
    emailIdx: uniqueIndex('users_email_idx')
      .on(t.email)
      .where(sql`email IS NOT NULL AND deleted_at IS NULL`),
    roleIdx: index('users_role_idx').on(t.role),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
