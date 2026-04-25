// Frame Ops Web — /api/admin/products/[id]
// PATCH: 상품 수정 (브랜드/제품번호/컬러/라인 변경 시 중복 검증, 표시명 자동 갱신)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import {
  displayNameThreePart,
  normalizeProductLine,
} from '@/lib/product-codes';
import type { Database } from '@/types/database';

type ProductUpdate = Database['public']['Tables']['fo_products']['Update'];

interface PatchBody {
  brand_id?: string;
  product_line?: string;
  category?: string;
  style_code?: string;
  color_code?: string;
  cost_price?: number;
  suggested_retail?: number;
  sale_price?: number;
  status?: string;
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
    const db = getDB();

    // 현재 행 조회
    const { data: current, error: getErr } = await db
      .from('fo_products')
      .select('id, brand_id, product_line, style_code, color_code')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !current) {
      return NextResponse.json(
        { data: null, error: getErr?.message ?? '상품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 변경될 4-tuple
    const nextBrand = body.brand_id ?? current.brand_id;
    const nextStyle = (body.style_code ?? current.style_code ?? '').trim();
    const nextColor = (body.color_code ?? current.color_code ?? '').trim();
    const nextLine = normalizeProductLine(body.product_line ?? current.product_line ?? '');

    // 4-tuple 이 바뀌면 중복 체크
    const tupleChanged =
      body.brand_id !== undefined ||
      body.style_code !== undefined ||
      body.color_code !== undefined ||
      body.product_line !== undefined;

    if (tupleChanged && nextBrand) {
      const { data: dup } = await db
        .from('fo_products')
        .select('id, product_code')
        .eq('brand_id', nextBrand)
        .eq('style_code', nextStyle)
        .eq('color_code', nextColor)
        .eq('product_line', nextLine)
        .neq('id', id)
        .maybeSingle();
      if (dup) {
        return NextResponse.json(
          {
            data: null,
            error: `동일 조합 다른 상품 존재: ${dup.product_code}`,
          },
          { status: 409 }
        );
      }
    }

    // 브랜드 변경 시 표시명 갱신
    let nextDisplayName: string | undefined;
    if (tupleChanged) {
      const { data: brand } = await db
        .from('fo_brands')
        .select('name')
        .eq('id', nextBrand!)
        .maybeSingle();
      if (brand) {
        nextDisplayName = displayNameThreePart(brand.name, nextStyle, nextColor);
      }
    }

    const update: ProductUpdate = {};
    if (body.brand_id !== undefined) update.brand_id = body.brand_id;
    if (body.product_line !== undefined) update.product_line = nextLine;
    if (body.style_code !== undefined) update.style_code = nextStyle;
    if (body.color_code !== undefined) update.color_code = nextColor;
    if (body.category !== undefined) update.category = body.category.trim();
    if (body.cost_price !== undefined) update.cost_price = body.cost_price;
    if (body.suggested_retail !== undefined) update.suggested_retail = body.suggested_retail;
    if (body.sale_price !== undefined) update.sale_price = body.sale_price;
    if (body.status !== undefined) update.status = body.status;
    if (nextDisplayName) update.display_name = nextDisplayName;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('fo_products')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
