import Redis from 'ioredis';

const url = process.env.REDIS_URL;

if (!url) {
  throw new Error('REDIS_URL is not set');
}

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
  // eslint-disable-next-line no-var
  var __redisSub: Redis | undefined;
}

export const redis: Redis =
  globalThis.__redis ??
  new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

export const redisSub: Redis =
  globalThis.__redisSub ??
  new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__redis = redis;
  globalThis.__redisSub = redisSub;
}

export const CHANNELS = {
  orderCreated: 'orders:created',
  orderShipped: 'orders:shipped',
  orderDelivered: 'orders:delivered',
  orderCompleted: 'orders:completed',
} as const;
