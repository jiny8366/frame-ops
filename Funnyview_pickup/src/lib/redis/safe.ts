/**
 * Redis 안전 래퍼.
 * REDIS_URL 미설정 환경에서도 앱이 동작하도록 캡슐화.
 * - publish/subscribe 가 실패해도 핵심 비즈니스 로직은 진행
 */
import Redis from 'ioredis';

let pub: Redis | null = null;
let sub: Redis | null = null;

export const CHANNELS = {
  // 사용자별 채널: notifications:{userId}
  userPrefix: 'notifications:',
} as const;

export function userChannel(userId: string) {
  return CHANNELS.userPrefix + userId;
}

function url(): string | null {
  return process.env.REDIS_URL || null;
}

export function getPublisher(): Redis | null {
  const u = url();
  if (!u) return null;
  if (!pub) {
    try {
      pub = new Redis(u, { maxRetriesPerRequest: 3, lazyConnect: false });
      pub.on('error', () => {
        // 무시 — 알림 실패는 비즈니스에 영향 없음
      });
    } catch {
      pub = null;
    }
  }
  return pub;
}

export function createSubscriber(): Redis | null {
  const u = url();
  if (!u) return null;
  try {
    const r = new Redis(u, { maxRetriesPerRequest: null });
    r.on('error', () => {
      // 무시
    });
    return r;
  } catch {
    return null;
  }
}

export async function publishToUser(
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const p = getPublisher();
  if (!p) return;
  try {
    await p.publish(userChannel(userId), JSON.stringify(payload));
  } catch {
    // 무시
  }
}

/**
 * 정리 함수 (테스트/종료 시).
 */
export async function shutdown(): Promise<void> {
  if (pub) {
    try { await pub.quit(); } catch {}
    pub = null;
  }
  if (sub) {
    try { await sub.quit(); } catch {}
    sub = null;
  }
}
