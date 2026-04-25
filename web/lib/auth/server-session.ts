// Frame Ops Web — 서버 컴포넌트/라우트에서 현재 세션을 읽는 유틸.
// 쿠키 → JWT 검증 → SessionPayload 또는 null.

import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession, type SessionPayload } from './session';

export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return await verifySession(token);
}
