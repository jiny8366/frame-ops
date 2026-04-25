// Frame Ops Web — /api/products/search
// RPC search_products_fast 호출. trigram 퍼지 매치 + 브랜드 필터 + 페이지네이션.

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || undefined;
    const brandId = url.searchParams.get('brand') || undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const db = getDB();
    const { data, error } = await db.rpc('search_products_fast', {
      p_query: query,
      p_brand_id: brandId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { data, error: null },
      {
        headers: {
          // 검색 결과는 짧게 캐싱 (CDN)
          'Cache-Control': 's-maxage=10, stale-while-revalidate=60',
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
