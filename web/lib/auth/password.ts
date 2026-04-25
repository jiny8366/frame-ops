// Frame Ops Web — 패스워드 해싱·비교 (bcryptjs, Node 전용)
// middleware (Edge) 에서는 사용 금지. API 라우트에서만.

import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
