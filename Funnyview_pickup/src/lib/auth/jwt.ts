import { SignJWT, jwtVerify } from 'jose';

export interface SessionPayload {
  uid: string; // users.id
  role: 'customer' | 'warehouse_staff' | 'store_staff' | 'admin';
  storeId?: string | null;
  iat?: number;
  exp?: number;
}

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error('JWT_SECRET is not set');
  }
  return new TextEncoder().encode(raw);
}

function maxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS ?? 30);
  return days * 24 * 60 * 60;
}

export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds()}s`)
    .sign(secret());
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
