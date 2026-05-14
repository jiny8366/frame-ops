export type OAuthProvider = 'naver' | 'kakao' | 'google';

export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  name: string | null;
  profileImageUrl: string | null;
  raw: unknown;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
}

export interface OAuthProviderAdapter {
  provider: OAuthProvider;
  authorizeUrl(args: { state: string; redirectUri: string }): string;
  exchangeCode(args: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokens>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}
