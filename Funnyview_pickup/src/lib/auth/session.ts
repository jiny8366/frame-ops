import { cookies } from 'next/headers';
import { signSession, verifySession, type SessionPayload } from './jwt';

function cookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? 'funnyview_pickup_session';
}

function maxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS ?? 30);
  return days * 24 * 60 * 60;
}

export async function setSessionCookie(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<void> {
  const token = await signSession(payload);
  cookies().set(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds(),
  });
}

export async function clearSessionCookie(): Promise<void> {
  cookies().delete(cookieName());
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(cookieName())?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}

export async function requireRole(
  ...roles: SessionPayload['role'][]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}
