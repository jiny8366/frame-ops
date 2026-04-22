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
      .eq('is_active', true)
      .order('brand_name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}
