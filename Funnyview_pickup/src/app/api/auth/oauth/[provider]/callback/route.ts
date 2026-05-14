import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { linkOrCreateOAuthUser } from '@/lib/auth/oauth/link-user';
import { getOAuthAdapter, getRedirectUri } from '@/lib/auth/oauth/registry';
import {
  OAUTH_STATE_COOKIE,
  verifyStateToken,
} from '@/lib/auth/oauth/state';
import { setSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

function loginErrorRedirect(reason: string, base: string) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(reason)}`, base),
  );
}

export async function GET(
  req: Request,
  ctx: { params: { provider: string } },
) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return loginErrorRedirect('oauth_cancelled', req.url);
  }

  const adapter = getOAuthAdapter(ctx.params.provider);
  if (!adapter) return loginErrorRedirect('oauth_provider_unknown', req.url);

  if (!code || !stateToken) {
    return loginErrorRedirect('oauth_invalid_callback', req.url);
  }

  const cookieStore = cookies();
  const nonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const fallbackReturnTo =
    cookieStore.get(OAUTH_STATE_COOKIE + '_rt')?.value || '/customer';

  const state = await verifyStateToken(stateToken, nonce);
  if (!state) return loginErrorRedirect('oauth_state_invalid', req.url);

  let userId: string;
  let needsPhone: boolean;
  try {
    const redirectUri = getRedirectUri(adapter.provider);
    const tokens = await adapter.exchangeCode({ code, redirectUri });
    const profile = await adapter.fetchProfile(tokens.accessToken);
    const linked = await linkOrCreateOAuthUser(adapter.provider, profile, tokens);
    userId = linked.userId;
    needsPhone = linked.needsPhone;
  } catch {
    return loginErrorRedirect('oauth_exchange_failed', req.url);
  }

  await setSessionCookie({ uid: userId, role: 'customer' });

  // 상태 쿠키 정리
  const target = needsPhone
    ? `/onboarding/phone?next=${encodeURIComponent(state.returnTo || fallbackReturnTo)}`
    : state.returnTo || fallbackReturnTo;

  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_STATE_COOKIE + '_rt');
  return res;
}
