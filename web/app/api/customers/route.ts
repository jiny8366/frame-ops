// Frame Ops Web — /api/customers
// Frame Ops 전용 고객 조회 (POS 판매 시 고객 연결용)
// 고객 상세 관리(처방전 이력 등)는 Genius CRM과 무관하게 독립 운영

import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search') ?? '';
    const limit  = Math.min(Number(searchParams.get('limit') ?? 20), 100);

    const db = getDB();
    let query = db
      .from('fo_customers')
      .select('id, name, phone, birth_date, gender, memo, updated_at')
      .order('name', { ascending: true })
      .limit(limit);

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDB();
    const { data, error } = await db
      .from('fo_customers')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ data: null, error: String(e) }, { status: 500 });
  }
}
