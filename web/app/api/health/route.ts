// Frame Ops Web — /api/health
// Cold-start 방지용 워머 엔드포인트 (Edge runtime). 외부 cron 으로 5-10분 주기 핑.
// - 인증 불필요 (공개)
// - 가벼운 DB 핑(fo_stores count 1행)으로 Supabase 커넥션 유지
// - 응답 즉시 종료 (300ms 타임아웃 — 핑 자체가 느려지면 의미 없음)

export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET() {
  const t0 = Date.now();
  try {
    const db = getDB();
    const dbStart = Date.now();
    // fo_stores 는 행 수가 적고(매장 수십 개 이내) 자주 조회되어 Supabase 측 캐시도 적중률 높음.
    // count: 'exact', head: true 로 행 데이터를 받지 않고 카운트만 — 최소 트래픽.
    await db.from('fo_stores').select('id', { count: 'exact', head: true }).limit(1);
    const dbMs = Date.now() - dbStart;

    return NextResponse.json(
      {
        status: 'ok',
        ts: new Date().toISOString(),
        timings: { db_ms: dbMs, total_ms: Date.now() - t0 },
      },
      {
        // CDN 캐시 금지 — 매번 함수가 실제로 깨어나야 의미가 있음
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        timings: { total_ms: Date.now() - t0 },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
