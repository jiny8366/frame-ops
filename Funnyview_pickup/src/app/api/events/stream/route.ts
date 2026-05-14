import { getCurrentUser } from '@/lib/auth/current-user';
import { createSubscriber, userChannel } from '@/lib/redis/safe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 사용자별 SSE 스트림.
 * Redis Pub/Sub 채널(notifications:{userId}) 구독 → SSE 로 중계.
 * Redis 미연결 시 단순 keep-alive 만 전송 (클라이언트는 polling 으로 보완).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const channel = userChannel(user.id);
  const subscriber = createSubscriber();

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: string, event?: string) {
        let line = '';
        if (event) line += `event: ${event}\n`;
        line += `data: ${data}\n\n`;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          // 컨트롤러가 닫혔으면 무시
        }
      }

      send(JSON.stringify({ ok: true, redis: !!subscriber, ts: Date.now() }), 'hello');

      if (subscriber) {
        try {
          await subscriber.subscribe(channel);
          subscriber.on('message', (_ch: string, message: string) => {
            send(message, 'notify');
          });
        } catch {
          // 구독 실패 → keep-alive 만 유지
        }
      }

      // 매 25초마다 keep-alive
      keepAlive = setInterval(() => {
        send(JSON.stringify({ ts: Date.now() }), 'ping');
      }, 25_000);

      // 클라이언트 abort 시 정리
      const onAbort = async () => {
        if (keepAlive) clearInterval(keepAlive);
        if (subscriber) {
          try {
            await subscriber.unsubscribe(channel);
            await subscriber.quit();
          } catch {}
        }
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener('abort', onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
