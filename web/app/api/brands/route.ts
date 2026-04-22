// Frame Ops Web — /api/brands
// GET: 브랜드 목록

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET() {
  try {
    const db = getDB();
    const { data, error } = await db
      .from('fo_brands')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : typeof e === 'object' && e !== null ? JSON.stringify(e)
      : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
