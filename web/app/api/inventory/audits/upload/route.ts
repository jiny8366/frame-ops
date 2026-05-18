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
import { formatColor } from '@/lib/product-codes';
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
  baseline_at_audit: number;   // audit_date 시점 추산 재고 = current_stock - delta_after_audit
  counted_quantity: number;
  audit_delta: number;         // ★ 실재고조사 증감 = counted - baseline
  delta_after_audit: number;   // audit_date 이후 net 거래
  applied_quantity: number;    // 적용 후 최종 = counted + delta_after_audit
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

/** 컬러 정규화 — DB 원본과 업로드 입력 양쪽에 동일한 변환 적용 (round-trip 정합성 보장).
 *   다운로드 엑셀의 '컬러번호' = formatColor(DB color_code) 결과 ("C_01", "C_2197", "C_OMPACT BLACK" 등).
 *   업로드 시 DB 원본과 매칭하려면 양쪽 모두 동일 함수를 거쳐서 표준화한 후 비교.
 *   추가로 숫자형은 2자리 zero-pad 까지 강화 (예: "C_1" → "C_01" 동치). */
function normalizeColor(raw: string): string {
  if (!raw) return '';
  const formatted = formatColor(raw); // 'C_XX' 형태로 표준화 (없으면 '—')
  if (formatted === '—') return '';
  // 'C_숫자' 케이스 — 숫자만 2자리 패딩 (사용자가 '1' 또는 '01' 모두 매칭되게)
  const m = formatted.match(/^C_(\d+)$/);
  if (m) return `C_${m[1].padStart(2, '0')}`;
  return formatted;
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
    if (!storeId) {
      return NextResponse.json(
        { data: null, error: '재고조사를 적용할 매장이 지정되지 않았습니다. (본사 계정은 매장 선택 필요)' },
        { status: 400 }
      );
    }
    if (!auditDate || !/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
      return NextResponse.json(
        { data: null, error: 'audit_date 는 YYYY-MM-DD 형식이어야 합니다.' },
        { status: 400 }
      );
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await file.arrayBuffer());
    } catch {
      return NextResponse.json({ data: null, error: '엑셀 파일 읽기 실패.' }, { status: 400 });
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buf, { type: 'buffer' });
    } catch (e) {
      return NextResponse.json(
        { data: null, error: `엑셀 파싱 실패 — 손상되었거나 .xlsx 가 아닙니다 (${e instanceof Error ? e.message : 'unknown'})` },
        { status: 400 }
      );
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      return NextResponse.json({ data: null, error: '엑셀 시트를 찾을 수 없습니다.' }, { status: 400 });
    }
    // 1행 헤더 가정. 헤더 매핑은 한글 컬럼명 기준.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: '엑셀에 데이터가 없습니다.' }, { status: 400 });
    }

    // 헤더 키 유연 매핑 (다운로드 파일이 '브랜드' / 한글 헤더, 사용자가 임의 변경 가능성 대비)
    const pickValue = (r: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        if (k in r && r[k] !== '' && r[k] != null) return r[k];
      }
      return '';
    };

    const parsed: ParsedRow[] = rows
      .map((r) => ({
        raw_brand: asString(pickValue(r, '브랜드', 'Brand', 'brand', 'BRAND')),
        raw_style: asString(pickValue(r, '제품번호', '스타일', 'style_code', 'Style', 'STYLE')),
        raw_color: asString(pickValue(r, '컬러번호', '컬러', 'color_code', 'Color', 'COLOR')),
        counted: asInt(pickValue(r, '현재고', '수량', 'stock', 'Stock', 'STOCK', '실재고')),
      }))
      .filter((r) => r.raw_style.length > 0);

    if (parsed.length === 0) {
      const headers = rows[0] ? Object.keys(rows[0]).join(', ') : '(빈 헤더)';
      return NextResponse.json(
        {
          data: null,
          error: `엑셀에서 유효한 행을 찾지 못했습니다. 헤더에 '제품번호' 컬럼이 있어야 합니다. 감지된 헤더: ${headers}`,
        },
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

    // uploaded_by 안전성 — fo_staff_profiles 에 존재하는 경우만 기록.
    // (FK 위반으로 헤더 insert 가 통째로 실패하는 것 방지)
    let uploadedBy: string | null = null;
    if (session.staff_user_id) {
      const { data: profileExists } = await db
        .from('fo_staff_profiles')
        .select('user_id')
        .eq('user_id', session.staff_user_id)
        .maybeSingle();
      if (profileExists) uploadedBy = session.staff_user_id;
    }

    // audit 헤더 insert
    const { data: audit, error: aErr } = await dbAny
      .from('fo_stock_audits')
      .insert({
        store_id: storeId,
        audit_date: auditDate,
        uploaded_by: uploadedBy,
        note: note || null,
        status: 'draft',
        total_lines: parsed.length,
      })
      .select('id')
      .single();
    if (aErr || !audit) {
      return NextResponse.json(
        {
          data: null,
          error: `재고조사 헤더 생성 실패: ${aErr?.message ?? 'unknown'}${aErr?.hint ? ` (${aErr.hint})` : ''}`,
        },
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
      return NextResponse.json(
        {
          data: null,
          error: `라인 저장 실패: ${lErr.message}${lErr.hint ? ` (${lErr.hint})` : ''}`,
        },
        { status: 500 }
      );
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
