// Frame Ops Web — /api/admin/products
// GET ?q=&brand_id=&line=&status=  → 상품 리스트 (최신 500)
// POST                              → 신규 상품 생성 (코드/표시명 자동)

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import {
  allocateUniqueProductCode,
  buildProductCodeBase,
  displayNameThreePart,
  normalizeProductLine,
} from '@/lib/product-codes';

interface CreateBody {
  brand_id: string;
  product_line: string;
  category: string;
  style_code: string;
  color_code: string;
  cost_price?: number;
  suggested_retail?: number;
  sale_price?: number;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const brandId = url.searchParams.get('brand_id') ?? '';
  const line = url.searchParams.get('line') ?? '';
  const status = url.searchParams.get('status') ?? '';

  const db = getDB();
  let query = db
    .from('fo_products')
    .select(
      'id, product_code, barcode, brand_id, product_line, category, style_code, color_code, display_name, cost_price, suggested_retail, sale_price, stock_quantity, status, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (brandId) query = query.eq('brand_id', brandId);
  if (line) query = query.eq('product_line', line.toUpperCase());
  if (status) query = query.eq('status', status);
  if (q) {
    // PostgREST or-filter
    query = query.or(
      `product_code.ilike.%${q}%,display_name.ilike.%${q}%,style_code.ilike.%${q}%,color_code.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  // brand 이름 매핑 (UI 표시용)
  const brandIds = Array.from(new Set((data ?? []).map((r) => r.brand_id).filter(Boolean) as string[]));
  let brandMap: Record<string, string> = {};
  if (brandIds.length > 0) {
    const { data: brands } = await db.from('fo_brands').select('id, name').in('id', brandIds);
    brandMap = Object.fromEntries((brands ?? []).map((b) => [b.id, b.name]));
  }

  const enriched = (data ?? []).map((r) => ({
    ...r,
    brand_name: r.brand_id ? brandMap[r.brand_id] ?? '' : '',
  }));

  return NextResponse.json({ data: enriched, error: null });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateBody;
    const styleCode = (body.style_code ?? '').trim();
    const colorCode = (body.color_code ?? '').trim();
    const category = (body.category ?? '').trim();
    const productLine = normalizeProductLine(body.product_line);

    if (!body.brand_id) {
      return NextResponse.json({ data: null, error: '브랜드를 선택하세요.' }, { status: 400 });
    }
    if (!styleCode || !colorCode) {
      return NextResponse.json(
        { data: null, error: '제품번호·컬러는 필수입니다.' },
        { status: 400 }
      );
    }
    if (!category) {
      return NextResponse.json({ data: null, error: '카테고리를 선택하세요.' }, { status: 400 });
    }

    const db = getDB();

    // 브랜드명 조회 (코드 생성용)
    const { data: brand, error: brandErr } = await db
      .from('fo_brands')
      .select('id, name')
      .eq('id', body.brand_id)
      .maybeSingle();
    if (brandErr || !brand) {
      return NextResponse.json(
        { data: null, error: brandErr?.message ?? '브랜드를 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // 동일 (브랜드+스타일+컬러+라인) 중복 체크
    const { data: dup } = await db
      .from('fo_products')
      .select('id, product_code')
      .eq('brand_id', body.brand_id)
      .eq('style_code', styleCode)
      .eq('color_code', colorCode)
      .eq('product_line', productLine)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        {
          data: null,
          error: `동일 조합이 이미 등록됨: 상품코드 ${dup.product_code}. 수정하거나 다른 컬러/라인 사용`,
        },
        { status: 409 }
      );
    }

    // 코드 + 표시명 자동 생성
    const base = buildProductCodeBase(productLine, brand.name, styleCode, colorCode);
    const code = await allocateUniqueProductCode(db, base);
    const displayName = displayNameThreePart(brand.name, styleCode, colorCode);

    const { data: created, error: insErr } = await db
      .from('fo_products')
      .insert({
        product_code: code,
        barcode: code,
        display_name: displayName,
        category,
        brand_id: body.brand_id,
        product_line: productLine,
        style_code: styleCode,
        color_code: colorCode,
        cost_price: body.cost_price ?? 0,
        suggested_retail: body.suggested_retail ?? 0,
        sale_price: body.sale_price ?? 0,
        status: 'active',
      })
      .select('*')
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { data: null, error: insErr?.message ?? '생성 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: created, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
