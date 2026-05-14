import { NextResponse } from 'next/server';
import {
  getEnabledProviders,
  getOAuthAdapter,
  getRedirectUri,
} from '@/lib/auth/oauth/registry';
import { OAUTH_STATE_COOKIE, createStateToken } from '@/lib/auth/oauth/state';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: { provider: string } },
) {
  const adapter = getOAuthAdapter(ctx.params.provider);
  if (!adapter || !getEnabledProviders().includes(adapter.provider)) {
    return NextResponse.json({ error: 'PROVIDER_NOT_ENABLED' }, { status: 400 });
  }

  const url = new URL(req.url);
  const returnTo = url.searchParams.get('returnTo') || '/customer';

  const { state, cookieName, cookieValue, maxAge } = await createStateToken(returnTo);
  const redirectUri = getRedirectUri(adapter.provider);
  const authorize = adapter.authorizeUrl({ state, redirectUri });

  const res = NextResponse.redirect(authorize);
  res.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  // returnTo 도 별도 저장 (state JWT 변조 방지에 더해 fallback)
  res.cookies.set(OAUTH_STATE_COOKIE + '_rt', returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  return res;
}
