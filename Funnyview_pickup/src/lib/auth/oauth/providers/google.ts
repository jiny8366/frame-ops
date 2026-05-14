import type { OAuthProviderAdapter } from '../types';

function env() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 미설정');
  }
  return { id, secret };
}

export const googleProvider: OAuthProviderAdapter = {
  provider: 'google',

  authorizeUrl({ state, redirectUri }) {
    const { id } = env();
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', id);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('scope', 'openid email profile');
    u.searchParams.set('access_type', 'online');
    u.searchParams.set('prompt', 'select_account');
    return u.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const { id, secret } = env();
    const body = new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) throw new Error('GOOGLE_TOKEN_MISSING');
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresInSeconds: json.expires_in ?? null,
    };
  },

  async fetchProfile(accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('GOOGLE_PROFILE_FETCH_FAILED');
    const json = (await res.json()) as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };
    if (!json.sub) throw new Error('GOOGLE_PROFILE_INVALID');
    return {
      providerUserId: json.sub,
      email: json.email ?? null,
      name: json.name ?? null,
      profileImageUrl: json.picture ?? null,
      raw: json,
    };
  },
};
