import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { inventory, lensVariants, lenses } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * 활성 렌즈 목록 (variant 별 가용재고 포함).
 * 고객 주문 화면에서 선택 가능한 SKU 만 노출.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const brand = url.searchParams.get('brand');

  const rows = await db
    .select({
      lensId: lenses.id,
      productCode: lenses.productCode,
      brand: lenses.brand,
      name: lenses.name,
      lensType: lenses.lensType,
      replacementCycle: lenses.replacementCycle,
      piecesPerBox: lenses.piecesPerBox,
      price: lenses.price,
      imageUrl: lenses.imageUrl,
      variantId: lensVariants.id,
      sku: lensVariants.sku,
      sphere: lensVariants.sphere,
      cylinder: lensVariants.cylinder,
      axis: lensVariants.axis,
      addPower: lensVariants.addPower,
      priceOverride: lensVariants.priceOverride,
      available: sql<number>`COALESCE(${inventory.quantityOnHand} - ${inventory.quantityReserved}, 0)`,
    })
    .from(lenses)
    .innerJoin(lensVariants, eq(lensVariants.lensId, lenses.id))
    .leftJoin(inventory, eq(inventory.variantId, lensVariants.id))
    .where(
      and(
        eq(lenses.isActive, true),
        eq(lensVariants.isActive, true),
        brand ? eq(lenses.brand, brand) : sql`TRUE`,
      ),
    )
    .orderBy(lenses.brand, lenses.name, lensVariants.sphere);

  // lens 단위로 그룹화
  const grouped = new Map<
    string,
    {
      lensId: string;
      productCode: string;
      brand: string;
      name: string;
      lensType: string;
      replacementCycle: string;
      piecesPerBox: number;
      price: number;
      imageUrl: string | null;
      variants: Array<{
        variantId: string;
        sku: string;
        sphere: string;
        cylinder: string | null;
        axis: number | null;
        addPower: string | null;
        price: number;
        available: number;
      }>;
    }
  >();

  for (const r of rows) {
    let lens = grouped.get(r.lensId);
    if (!lens) {
      lens = {
        lensId: r.lensId,
        productCode: r.productCode,
        brand: r.brand,
        name: r.name,
        lensType: r.lensType,
        replacementCycle: r.replacementCycle,
        piecesPerBox: r.piecesPerBox,
        price: r.price,
        imageUrl: r.imageUrl,
        variants: [],
      };
      grouped.set(r.lensId, lens);
    }
    lens.variants.push({
      variantId: r.variantId,
      sku: r.sku,
      sphere: r.sphere,
      cylinder: r.cylinder,
      axis: r.axis,
      addPower: r.addPower,
      price: r.priceOverride ?? r.price,
      available: Number(r.available ?? 0),
    });
  }

  return NextResponse.json({ lenses: Array.from(grouped.values()) });
}
