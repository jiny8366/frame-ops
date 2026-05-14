import { NextResponse } from 'next/server';
import { getEnabledProviders } from '@/lib/auth/oauth/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ providers: getEnabledProviders() });
}
