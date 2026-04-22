// Frame Ops Web — /api/customers
// ⛔ 고객 관리는 Frame Ops 범위 밖 — 이 엔드포인트는 사용하지 않음

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Not used in Frame Ops' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not used in Frame Ops' }, { status: 404 });
}
