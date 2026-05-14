import type { OAuthProviderAdapter } from '../types';

function env() {
  const id = process.env.KAKAO_CLIENT_ID;
  const secret = process.env.KAKAO_CLIENT_SECRET ?? '';
  if (!id) throw new Error('KAKAO_CLIENT_ID 미설정');
  return { id, secret };
}

export const kakaoProvider: OAuthProviderAdapter = {
  provider: 'kakao',

  authorizeUrl({ state, redirectUri }) {
    const { id } = env();
    const u = new URL('https://kauth.kakao.com/oauth/authorize');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', id);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('scope', 'profile_nickname,profile_image,account_email');
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = env();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: id,
      redirect_uri: redirectUri,
      code,
    });
    if (secret) body.set('client_secret', secret);

    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error('KAKAO_TOKEN_EXCHANGE_FAILED');
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) throw new Error('KAKAO_TOKEN_MISSING');
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresInSeconds: json.expires_in ?? null,
    };
  },

  async fetchProfile(accessToken) {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('KAKAO_PROFILE_FETCH_FAILED');
    const json = (await res.json()) as {
      id: number;
      kakao_account?: {
        email?: string;
        profile?: { nickname?: string; profile_image_url?: string };
      };
    };
    if (!json.id) throw new Error('KAKAO_PROFILE_INVALID');
    return {
      providerUserId: String(json.id),
      email: json.kakao_account?.email ?? null,
      name: json.kakao_account?.profile?.nickname ?? null,
      profileImageUrl: json.kakao_account?.profile?.profile_image_url ?? null,
      raw: json,
    };
  },
};
