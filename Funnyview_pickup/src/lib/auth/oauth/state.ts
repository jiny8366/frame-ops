import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

const STATE_COOKIE = 'fv_oauth_state';
const STATE_TTL_SECONDS = 600; // 10분

interface StatePayload {
  nonce: string;
  returnTo: string;
  iat?: number;
  exp?: number;
}

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET 미설정');
  return new TextEncoder().encode(raw);
}

export async function createStateToken(returnTo: string): Promise<{
  state: string;
  cookieName: string;
  cookieValue: string;
  maxAge: number;
}> {
  const nonce = crypto.randomBytes(16).toString('hex');
  const token = await new SignJWT({ nonce, returnTo })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(secret());

  return {
    state: token,
    cookieName: STATE_COOKIE,
    cookieValue: nonce,
    maxAge: STATE_TTL_SECONDS,
  };
}

export async function verifyStateToken(
  state: string,
  cookieNonce: string | undefined,
): Promise<StatePayload | null> {
  if (!state || !cookieNonce) return null;
  try {
    const { payload } = await jwtVerify(state, secret());
    const p = payload as unknown as StatePayload;
    if (p.nonce !== cookieNonce) return null;
    return p;
  } catch {
    return null;
  }
}

export const OAUTH_STATE_COOKIE = STATE_COOKIE;
