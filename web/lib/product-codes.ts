// Frame Ops Web — 상품코드 v2 (2026-04 정책)
// 형식: {LINE}_{CATEGORY_CODE}/{BRAND_CODE}/{YYMM}/{STYLE4}/{COLOR2}
// 예: FRM_MTL/ABC/2604/0101/04
//
// 구성:
// - LINE: FRM (안경테) 또는 SUN (선글라스)
// - CATEGORY_CODE: 소재 3자 영문 (fo_product_categories.code)
// - BRAND_CODE: 브랜드 3자 영문 (fo_brands.code)
// - YYMM: 등록일자 4자리 (예: 2604)
// - STYLE4: 제품번호 4자리 숫자
// - COLOR2: 컬러 2자리 숫자

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const LINE_FRM = 'FRM';
export const LINE_SUN = 'SUN';
export const LINE_LABELS: Record<string, string> = {
  [LINE_FRM]: '안경테',
  [LINE_SUN]: '선글라스',
};

export type ProductLine = typeof LINE_FRM | typeof LINE_SUN;

export function normalizeProductLine(line: string | null | undefined): ProductLine {
  const x = (line ?? '').trim().toUpperCase();
  return x === LINE_SUN ? LINE_SUN : LINE_FRM;
}

/** 영문3자 약자 정규화: 영숫자만, 대문자, 3자. 부족하면 'X' 패딩, 넘치면 잘라냄. */
export function normalizeShortCode(s: string, length = 3): string {
  const t = (s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  if (!t) return 'X'.repeat(length);
  if (t.length >= length) return t.slice(0, length);
  return t.padEnd(length, 'X');
}

/** 4자리 숫자 보장. 비숫자면 'XXXX'. */
export function normalizeStyleCode(s: string): string {
  const t = (s ?? '').trim();
  if (!t) return 'XXXX';
  if (!/^[0-9]+$/.test(t)) return t.slice(0, 4);
  return t.padStart(4, '0').slice(-4);
}

/** 2자리 숫자 보장. 비숫자면 첫 숫자만 사용. */
export function normalizeColorCode(s: string): string {
  const t = (s ?? '').trim();
  if (!t) return '00';
  // 'C04' 같은 prefix 제거
  const digits = t.replace(/^[^0-9]+/, '');
  if (!digits) return '00';
  return digits.padStart(2, '0').slice(-2);
}

/** YYYY-MM-DD 또는 Date → YYMM (4 chars) */
export function yymmFromDate(d: Date = new Date()): string {
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + m;
}

/** 신정책 코드 베이스 생성 */
export function buildProductCodeBase(params: {
  productLine: string;
  categoryCode: string;
  brandCode: string;
  yymm?: string;
  styleCode: string;
  colorCode: string;
}): string {
  const line = normalizeProductLine(params.productLine);
  const cat = normalizeShortCode(params.categoryCode);
  const brand = normalizeShortCode(params.brandCode);
  const yymm = params.yymm ?? yymmFromDate();
  const style = normalizeStyleCode(params.styleCode);
  const color = normalizeColorCode(params.colorCode);
  return `${line}_${cat}/${brand}/${yymm}/${style}/${color}`;
}

/** 표시 상품명: 브랜드/제품번호/컬러 (변경 없음) */
export function displayNameThreePart(brand: string, style: string, color: string): string {
  return `${(brand ?? '').trim()}/${(style ?? '').trim()}/${(color ?? '').trim()}`;
}

/**
 * `product_code` 유일성 확보. 충돌 시 `-2`, `-3` 접미사. 500회 시도 한계.
 */
export async function allocateUniqueProductCode(
  db: SupabaseClient<Database>,
  base: string
): Promise<string> {
  const code = (base || 'SKU').slice(0, 200);
  for (let n = 0; n < 500; n++) {
    const cand = (n === 0 ? code : `${code}-${n + 1}`).slice(0, 200);
    const { data } = await db
      .from('fo_products')
      .select('id')
      .eq('product_code', cand)
      .limit(1);
    if (!data || data.length === 0) return cand;
  }
  throw new Error('상품코드 자동 채번 한도(500) 초과');
}
