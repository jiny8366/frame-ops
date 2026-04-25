// Frame Ops Web — 상품코드 생성 헬퍼 (Streamlit lib/fo_product_codes.py 포팅)
// 기존 정책 그대로: {LINE}-{BRAND}-{STYLE}-{COLOR} 베이스 + 충돌 시 -2, -3 접미사.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const LINE_FRM = 'FRM';
export const LINE_SUN = 'SUN';
export const LINE_LABELS: Record<string, string> = {
  [LINE_FRM]: '안경테',
  [LINE_SUN]: '선글라스',
};

export type ProductLine = typeof LINE_FRM | typeof LINE_SUN;

/** 영숫자·하이픈만 남기고 대문자, 양 끝 하이픈 제거. 빈 값은 'X'. */
export function sanitizeCodePart(s: string): string {
  let t = (s ?? '').trim().toUpperCase();
  t = t.replace(/[^A-Z0-9-]+/g, '-');
  t = t.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return t || 'X';
}

export function normalizeProductLine(line: string | null | undefined): ProductLine {
  const x = (line ?? '').trim().toUpperCase();
  return x === LINE_SUN ? LINE_SUN : LINE_FRM;
}

/** 기본 코드: FRM|SUN-브랜드-제품번호-컬러 */
export function buildProductCodeBase(
  productLine: string,
  brandName: string,
  styleCode: string,
  colorCode: string
): string {
  const pl = normalizeProductLine(productLine);
  const b = sanitizeCodePart(brandName).slice(0, 24);
  const s = sanitizeCodePart(styleCode).slice(0, 32);
  const c = sanitizeCodePart(colorCode).slice(0, 16);
  return `${pl}-${b}-${s}-${c}`;
}

/** 표시 상품명: 브랜드/제품번호/컬러 */
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
  const code = (base || 'SKU').slice(0, 180);
  for (let n = 0; n < 500; n++) {
    const cand = (n === 0 ? code : `${code}-${n + 1}`).slice(0, 180);
    const { data } = await db
      .from('fo_products')
      .select('id')
      .eq('product_code', cand)
      .limit(1);
    if (!data || data.length === 0) return cand;
  }
  throw new Error('상품코드 자동 채번 한도(500) 초과');
}
