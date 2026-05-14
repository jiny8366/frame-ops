import { googleProvider } from './providers/google';
import { kakaoProvider } from './providers/kakao';
import { naverProvider } from './providers/naver';
import type { OAuthProvider, OAuthProviderAdapter } from './types';

const REGISTRY: Record<OAuthProvider, OAuthProviderAdapter> = {
  naver: naverProvider,
  kakao: kakaoProvider,
  google: googleProvider,
};

export function getOAuthAdapter(provider: string): OAuthProviderAdapter | null {
  if (provider === 'naver' || provider === 'kakao' || provider === 'google') {
    return REGISTRY[provider];
  }
  return null;
}

export function getRedirectUri(provider: OAuthProvider): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return `${base.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
}

/**
 * 환경변수에 client id 가 설정된 provider 만 반환.
 * 로그인 페이지에서 사용 가능한 버튼을 결정.
 */
export function getEnabledProviders(): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  if (process.env.NAVER_CLIENT_ID) out.push('naver');
  if (process.env.KAKAO_CLIENT_ID) out.push('kakao');
  if (process.env.GOOGLE_CLIENT_ID) out.push('google');
  return out;
}
