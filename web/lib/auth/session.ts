// Frame Ops Web — JWT 세션 발급/검증 (HS256, jose)
// Edge runtime 호환 → middleware.ts 에서도 사용 가능.

import { jwtVerify, SignJWT } from 'jose';

export interface SessionPayload {
  staff_user_id: string;
  store_id: string;
  store_code: string;
  display_name: string;
  role_code: string;
}

const ALG = 'HS256';
const ISSUER = 'frame-ops';
// 매장 한 시프트(약 12h) 후 자동 로그아웃.
const EXPIRES_IN = '12h';

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET 이 .env.local 에 설정되지 않았거나 너무 짧습니다 (최소 32자).'
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      algorithms: [ALG],
    });
    if (
      typeof payload.staff_user_id !== 'string' ||
      typeof payload.store_id !== 'string' ||
      typeof payload.store_code !== 'string' ||
      typeof payload.display_name !== 'string' ||
      typeof payload.role_code !== 'string'
    ) {
      return null;
    }
    return {
      staff_user_id: payload.staff_user_id,
      store_id: payload.store_id,
      store_code: payload.store_code,
      display_name: payload.display_name,
      role_code: payload.role_code,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'fo_session';
