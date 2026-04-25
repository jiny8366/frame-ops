// Frame Ops Web — /api/admin/suppliers/[id]
// PATCH: 매입처 정보 수정 (활성/비활성 토글 포함)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import type { Database } from '@/types/database';

type SupplierUpdate = Database['public']['Tables']['fo_suppliers']['Update'];

interface PatchBody {
  name?: string;
  supplier_code?: string | null;
  contact?: string | null;
  business_number?: string | null;
  address?: string | null;
  memo?: string | null;
  active?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;

  try {
    const body = (await request.json()) as PatchBody;
    const update: SupplierUpdate = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.supplier_code !== undefined) update.supplier_code = body.supplier_code?.trim() || null;
    if (body.contact !== undefined) update.contact = body.contact?.trim() || null;
    if (body.business_number !== undefined) update.business_number = body.business_number?.trim() || null;
    if (body.address !== undefined) update.address = body.address?.trim() || null;
    if (body.memo !== undefined) update.memo = body.memo?.trim() || null;
    if (body.active !== undefined) update.active = body.active;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const db = getDB();
    const { data, error } = await db
      .from('fo_suppliers')
      .update(update)
      .eq('id', id)
      .select('id, supplier_code, name, contact, business_number, address, memo, active')
      .single();
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
