import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { oauthProviderEnum } from './enums';
import { users } from './users';

/**
 * 소셜 로그인 연동.
 * (provider, providerUserId) 유일 — 외부 ID 기준 1:1.
 * 한 user 는 여러 provider 연결 가능 (Naver + Kakao + Google).
 */
export const userOauthAccounts = pgTable(
  'user_oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProviderEnum('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email'),
    profileName: text('profile_name'),
    profileImageUrl: text('profile_image_url'),
    // 토큰은 사용처가 있을 때만 저장 (Naver/Kakao 친구 API 등). 기본은 NULL.
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    providerUserUnique: uniqueIndex('uoa_provider_user_unique').on(
      t.provider,
      t.providerUserId,
    ),
    userProviderUnique: uniqueIndex('uoa_user_provider_unique').on(
      t.userId,
      t.provider,
    ),
    emailIdx: index('uoa_email_idx').on(t.email),
  }),
);

export type UserOauthAccount = typeof userOauthAccounts.$inferSelect;
export type NewUserOauthAccount = typeof userOauthAccounts.$inferInsert;
