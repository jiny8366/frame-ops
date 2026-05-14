// Frame Ops Web — /api/inventory/audits/upload (POST)
// 재고조사 엑셀 업로드 → fo_stock_audits + fo_stock_audit_lines 'draft' 로 생성.
// 적용은 별도 /api/inventory/audits/[id]/apply 호출로 분리 (사용자 미리보기 후 확정).
//
// 엑셀 형식 (inventory 페이지 다운로드와 동일):
//   NO. | 라인 | 카테고리 | 브랜드 | 제품번호 | 컬러번호 | 현재고
//   (실재고조사 후 사용자가 '현재고' 컬럼을 실물 수량으로 수정 후 업로드)
//
// 매칭 키: (브랜드명, 제품번호, 컬러번호) → fo_products 조회.
// 매칭 실패 라인은 match_status='unmatched' 로 보존 (감사 추적).

import { NextResponse } from 'next/server';
import { getDB } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/server-session';
import * as XLSX from 'xlsx';

interface UploadResult {
  audit_id: string;
  total_lines: number;
  matched_lines: number;
  unmatched_lines: number;
  preview: PreviewRow[];
}

interface PreviewRow {
  line_id: string;
  product_id: string | null;
  brand_name: string | null;
  style_code: string | null;
  color_code: string | null;
  current_stock: number;
  counted_quantity: number;
  delta_after_audit: number;
  applied_quantity: number;
  match_status: 'matched' | 'unmatched' | 'skipped';
}

interface ParsedRow {
  raw_brand: string;
  raw_style: string;
  raw_color: string;
  counted: number;
}

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function asInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Math.trunc(v);
  const n = Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** 컬러 정규화 — \"01\" / \"1\" / \"1번\" 등을 2자리 zero-pad. \"COMPACT BLACK\" 등 텍스트는 그대로. */
function normalizeColor(raw: string): string {
  if (!raw) return '';
  const digits = raw.match(/^\s*0*(\d+)\s*$/);
  if (digits) return digits[1].padStart(2, '0');
  return raw.trim();
}

/** style 정규화 — 소문자/공백 제거. */
function normalizeStyle(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** 브랜드 정규화. */
function normalizeBrand(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // multipart/form-data 받기
    const form = await request.formData();
    const file = form.get('file');
    const auditDate = asString(form.get('audit_date'));
    const storeId = asString(form.get('store_id')) || session.store_id;
    const note = asString(form.get('note'));

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ data: null, error: '엑셀 파일이 필요합니다.' }, { status: 400 });
    }
    if (!auditDate || !/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
      return NextResponse.json(
        { data: null, error: 'audit_date 는 YYYY-MM-DD 형식이어야 합니다.' },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json({ data: null, error: '엑셀 시트를 찾을 수 없습니다.' }, { status: 400 });
    }
    // 1행 헤더 가정. 헤더 매핑은 한글 컬럼명 기준.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: '엑셀에 데이터가 없습니다.' }, { status: 400 });
    }

    const parsed: ParsedRow[] = rows
      .map((r) => ({
        raw_brand: asString(r['브랜드'] ?? r['Brand'] ?? r['brand']),
        raw_style: asString(r['제품번호'] ?? r['스타일'] ?? r['style_code'] ?? r['Style']),
        raw_color: asString(r['컬러번호'] ?? r['컬러'] ?? r['color_code'] ?? r['Color']),
        counted: asInt(r['현재고'] ?? r['수량'] ?? r['stock'] ?? r['Stock']),
      }))
      .filter((r) => r.raw_style.length > 0);

    if (parsed.length === 0) {
      return NextResponse.json(
        { data: null, error: '엑셀에서 유효한 행을 찾지 못했습니다. (제품번호 컬럼 누락?)' },
        { status: 400 }
      );
    }

    const db = getDB();
    // fo_stock_audits / fo_stock_audit_lines 는 generated Database types 에 아직 없음 → untyped 클라이언트로 캐스팅
    const dbAny = db as unknown as import('@supabase/supabase-js').SupabaseClient;

    // 매칭 후보 - 브랜드 + style + color 조합으로 fo_products 일괄 조회.
    // 효율을 위해 전체 active products 한 번에 받아 메모리에서 매칭.
    const { data: products, error: pErr } = await db
      .from('fo_products')
      .select('id, style_code, color_code, brand:fo_brands(id, name)');
    if (pErr) {
      return NextResponse.json({ data: null, error: pErr.message }, { status: 500 });
    }

    type ProdRow = {
      id: string;
      style_code: string | null;
      color_code: string | null;
      brand: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
    };
    const productList = (products ?? []) as unknown as ProdRow[];
    const productIndex = new Map<string, string>(); // key: BRAND|STYLE|COLOR → product_id
    for (const p of productList) {
      const brandObj = Array.isArray(p.brand) ? p.brand[0] : p.brand;
      const brandName = brandObj?.name ?? '';
      const key = [
        normalizeBrand(brandName),
        normalizeStyle(p.style_code ?? ''),
        normalizeColor(p.color_code ?? ''),
      ].join('|');
      productIndex.set(key, p.id);
    }

    // audit 헤더 insert
    const { data: audit, error: aErr } = await dbAny
      .from('fo_stock_audits')
      .insert({
        store_id: storeId,
        audit_date: auditDate,
        uploaded_by: session.staff_user_id,
        note: note || null,
        status: 'draft',
        total_lines: parsed.length,
      })
      .select('id')
      .single();
    if (aErr || !audit) {
      return NextResponse.json(
        { data: null, error: aErr?.message ?? '재고조사 헤더 생성 실패' },
        { status: 500 }
      );
    }

    // 라인 일괄 insert
    let matchedCount = 0;
    const lineRows = parsed.map((r) => {
      const key = [normalizeBrand(r.raw_brand), normalizeStyle(r.raw_style), normalizeColor(r.raw_color)].join('|');
      const product_id = productIndex.get(key) ?? null;
      if (product_id) matchedCount += 1;
      return {
        audit_id: audit.id,
        product_id,
        raw_brand: r.raw_brand || null,
        raw_style_code: r.raw_style || null,
        raw_color_code: r.raw_color || null,
        counted_quantity: r.counted,
        match_status: product_id ? 'matched' : 'unmatched',
      };
    });

    const { error: lErr } = await dbAny.from('fo_stock_audit_lines').insert(lineRows);
    if (lErr) {
      await dbAny.from('fo_stock_audits').delete().eq('id', audit.id);
      return NextResponse.json({ data: null, error: lErr.message }, { status: 500 });
    }

    await dbAny
      .from('fo_stock_audits')
      .update({ matched_lines: matchedCount })
      .eq('id', audit.id);

    // 미리보기 RPC 호출
    const { data: previewData, error: prevErr } = await (db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: PreviewRow[] | null; error: { message: string } | null }>)(
      'preview_stock_audit',
      { p_audit_id: audit.id }
    );

    if (prevErr) {
      return NextResponse.json({ data: null, error: prevErr.message }, { status: 500 });
    }

    const result: UploadResult = {
      audit_id: audit.id,
      total_lines: parsed.length,
      matched_lines: matchedCount,
      unmatched_lines: parsed.length - matchedCount,
      preview: (previewData ?? []) as PreviewRow[],
    };

    return NextResponse.json({ data: result, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ data: null, error: msg }, { status: 500 });
  }
}
