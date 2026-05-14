import type { OAuthProviderAdapter } from '../types';

function env() {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정');
  }
  return { id, secret };
}

export const naverProvider: OAuthProviderAdapter = {
  provider: 'naver',

  authorizeUrl({ state, redirectUri }) {
    const { id } = env();
    const u = new URL('https://nid.naver.com/oauth2.0/authorize');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', id);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = env();
    const u = new URL('https://nid.naver.com/oauth2.0/token');
    u.searchParams.set('grant_type', 'authorization_code');
    u.searchParams.set('client_id', id);
    u.searchParams.set('client_secret', secret);
    u.searchParams.set('code', code);
    u.searchParams.set('redirect_uri', redirectUri);

    const res = await fetch(u.toString(), { method: 'POST' });
    if (!res.ok) throw new Error('NAVER_TOKEN_EXCHANGE_FAILED');
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: string | number;
      error?: string;
    };
    if (!json.access_token) throw new Error('NAVER_TOKEN_MISSING');
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresInSeconds: json.expires_in != null ? Number(json.expires_in) : null,
    };
  },

  async fetchProfile(accessToken) {
    const res = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('NAVER_PROFILE_FETCH_FAILED');
    const json = (await res.json()) as {
      response?: {
        id: string;
        email?: string;
        name?: string;
        nickname?: string;
        profile_image?: string;
      };
    };
    const r = json.response;
    if (!r?.id) throw new Error('NAVER_PROFILE_INVALID');
    return {
      providerUserId: r.id,
      email: r.email ?? null,
      name: r.name ?? r.nickname ?? null,
      profileImageUrl: r.profile_image ?? null,
      raw: json,
    };
  },
};
