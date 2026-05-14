import { NextResponse } from 'next/server';
import { loadActiveSections } from '@/lib/home/load-sections';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sections = await loadActiveSections();
  return NextResponse.json({ sections });
}
