import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, userOauthAccounts, users } from '@/db/schema';
import type { OAuthProfile, OAuthProvider, OAuthTokens } from './types';

export interface OAuthLinkResult {
  userId: string;
  customerId: string;
  isNewUser: boolean;
  needsPhone: boolean;
}

/**
 * OAuth 콜백 후 user/customer 행 연결 또는 생성.
 *
 * 흐름:
 * 1) user_oauth_accounts (provider, providerUserId) 매칭 → 기존 user 로그인
 * 2) profile.email 로 기존 user 매칭 → 계정 연결
 * 3) 새 user 생성 + customers 생성 + oauth_account 생성
 *
 * 모든 경우 user_oauth_accounts.lastUsedAt 갱신.
 */
export async function linkOrCreateOAuthUser(
  provider: OAuthProvider,
  profile: OAuthProfile,
  tokens: OAuthTokens,
): Promise<OAuthLinkResult> {
  const expiresAt =
    tokens.expiresInSeconds != null
      ? new Date(Date.now() + tokens.expiresInSeconds * 1000)
      : null;

  // 1) 기존 OAuth 연결 조회
  const existing = await db
    .select({
      userId: userOauthAccounts.userId,
      accountId: userOauthAccounts.id,
    })
    .from(userOauthAccounts)
    .where(
      and(
        eq(userOauthAccounts.provider, provider),
        eq(userOauthAccounts.providerUserId, profile.providerUserId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(userOauthAccounts)
      .set({
        lastUsedAt: new Date(),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: expiresAt,
        email: profile.email,
        profileName: profile.name,
        profileImageUrl: profile.profileImageUrl,
      })
      .where(eq(userOauthAccounts.id, existing[0].accountId));

    const userRow = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(eq(users.id, existing[0].userId))
      .limit(1);
    const customerRow = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, existing[0].userId))
      .limit(1);

    return {
      userId: existing[0].userId,
      customerId: customerRow[0]?.id ?? '',
      isNewUser: false,
      needsPhone: !userRow[0]?.phone,
    };
  }

  // 2) email 매칭으로 계정 연결 시도 (이미 가입한 사용자가 다른 provider 로 로그인)
  let userId: string | null = null;
  let customerId: string | null = null;
  let isNewUser = false;

  if (profile.email) {
    const byEmail = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(and(eq(users.email, profile.email), isNull(users.deletedAt)))
      .limit(1);
    if (byEmail[0]) {
      userId = byEmail[0].id;
      const cust = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.userId, userId))
        .limit(1);
      customerId = cust[0]?.id ?? null;
    }
  }

  // 3) 신규 사용자 생성
  if (!userId) {
    isNewUser = true;
    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: profile.email,
          phone: null,
          passwordHash: null,
          role: 'customer',
          isActive: true,
        })
        .returning({ id: users.id });

      const referrerCode =
        'FV' + u.id.replace(/-/g, '').slice(0, 8).toUpperCase();

      const [c] = await tx
        .insert(customers)
        .values({
          userId: u.id,
          name: profile.name ?? 'Guest',
          phone: '', // 빈 문자열 — 온보딩에서 갱신
          referrerCode,
        })
        .returning({ id: customers.id });

      return { userId: u.id, customerId: c.id };
    });
    userId = created.userId;
    customerId = created.customerId;
  }

  // oauth_account row 생성
  await db.insert(userOauthAccounts).values({
    userId: userId!,
    provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
    profileName: profile.name,
    profileImageUrl: profile.profileImageUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: expiresAt,
  });

  // phone 보유 여부 확인
  const phoneRow = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId!))
    .limit(1);

  return {
    userId: userId!,
    customerId: customerId ?? '',
    isNewUser,
    needsPhone: !phoneRow[0]?.phone,
  };
}
