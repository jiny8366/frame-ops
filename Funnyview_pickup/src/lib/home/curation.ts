import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { inventory, lensVariants, lenses, orderItems, orders } from '@/db/schema';
import { getPublisher } from '@/lib/redis/safe';

export type CurationMode = 'best' | 'trending' | 'new' | 'manual';

export interface CuratedLens {
  id: string;
  brand: string;
  name: string;
  lensType: string;
  replacementCycle: string;
  piecesPerBox: number;
  price: number;
  imageUrl: string | null;
}

const CACHE_TTL_SECONDS = 300; // 5분
const CACHE_PREFIX = 'home:curation:';

async function readCache(key: string): Promise<CuratedLens[] | null> {
  const r = getPublisher();
  if (!r) return null;
  try {
    const raw = await r.get(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CuratedLens[];
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: CuratedLens[]): Promise<void> {
  const r = getPublisher();
  if (!r) return;
  try {
    await r.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // ignore
  }
}

/**
 * 큐레이션 모드별 렌즈 목록을 가져온다.
 * Redis 캐시(5분) → 미스 시 DB 쿼리.
 */
export async function curateLenses(
  mode: CurationMode,
  limit: number,
  manualIds: string[] = [],
): Promise<CuratedLens[]> {
  const cap = Math.min(Math.max(limit, 1), 12);
  const cacheKey = `${mode}:${cap}${mode === 'manual' ? ':' + manualIds.slice().sort().join(',') : ''}`;

  const cached = await readCache(cacheKey);
  if (cached) return cached;

  let rows: CuratedLens[];

  if (mode === 'manual') {
    if (manualIds.length === 0) return [];
    const result = await db
      .select({
        id: lenses.id,
        brand: lenses.brand,
        name: lenses.name,
        lensType: lenses.lensType,
        replacementCycle: lenses.replacementCycle,
        piecesPerBox: lenses.piecesPerBox,
        price: lenses.price,
        imageUrl: lenses.imageUrl,
      })
      .from(lenses)
      .where(and(eq(lenses.isActive, true), inArray(lenses.id, manualIds)))
      .limit(cap);
    // manualIds 순서 보존
    const byId = new Map(result.map((r) => [r.id, r]));
    rows = manualIds.map((id) => byId.get(id)).filter(Boolean) as CuratedLens[];
  } else if (mode === 'new') {
    const result = await db
      .select({
        id: lenses.id,
        brand: lenses.brand,
        name: lenses.name,
        lensType: lenses.lensType,
        replacementCycle: lenses.replacementCycle,
        piecesPerBox: lenses.piecesPerBox,
        price: lenses.price,
        imageUrl: lenses.imageUrl,
      })
      .from(lenses)
      .where(eq(lenses.isActive, true))
      .orderBy(desc(lenses.createdAt))
      .limit(cap);
    rows = result;
  } else if (mode === 'trending') {
    // 최근 7일 주문량 가중치 (취소 제외)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await db
      .select({
        id: lenses.id,
        brand: lenses.brand,
        name: lenses.name,
        lensType: lenses.lensType,
        replacementCycle: lenses.replacementCycle,
        piecesPerBox: lenses.piecesPerBox,
        price: lenses.price,
        imageUrl: lenses.imageUrl,
        score: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      })
      .from(lenses)
      .leftJoin(lensVariants, eq(lensVariants.lensId, lenses.id))
      .leftJoin(orderItems, eq(orderItems.variantId, lensVariants.id))
      .leftJoin(
        orders,
        and(
          eq(orders.id, orderItems.orderId),
          gte(orders.createdAt, since),
          sql`${orders.status} != 'cancelled'`,
        ),
      )
      .where(eq(lenses.isActive, true))
      .groupBy(lenses.id)
      .orderBy(sql`COALESCE(SUM(${orderItems.quantity}), 0) DESC`, sql`${lenses.createdAt} DESC`)
      .limit(cap);
    rows = result.map(({ score: _score, ...r }) => r);
  } else {
    // best: 전체 기간 주문량 (취소 제외) → 동률 시 가용재고 큰 순
    const result = await db
      .select({
        id: lenses.id,
        brand: lenses.brand,
        name: lenses.name,
        lensType: lenses.lensType,
        replacementCycle: lenses.replacementCycle,
        piecesPerBox: lenses.piecesPerBox,
        price: lenses.price,
        imageUrl: lenses.imageUrl,
      })
      .from(lenses)
      .leftJoin(lensVariants, eq(lensVariants.lensId, lenses.id))
      .leftJoin(inventory, eq(inventory.variantId, lensVariants.id))
      .leftJoin(orderItems, eq(orderItems.variantId, lensVariants.id))
      .leftJoin(
        orders,
        and(
          eq(orders.id, orderItems.orderId),
          sql`${orders.status} != 'cancelled'`,
        ),
      )
      .where(eq(lenses.isActive, true))
      .groupBy(lenses.id)
      .orderBy(
        sql`COALESCE(SUM(${orderItems.quantity}), 0) DESC`,
        sql`COALESCE(SUM(${inventory.quantityOnHand} - ${inventory.quantityReserved}), 0) DESC`,
      )
      .limit(cap);
    rows = result;
  }

  await writeCache(cacheKey, rows);
  return rows;
}

/**
 * 주문 생성/취소 시 호출하여 큐레이션 캐시 무효화.
 */
export async function invalidateCurationCache(): Promise<void> {
  const r = getPublisher();
  if (!r) return;
  try {
    const keys = await r.keys(CACHE_PREFIX + '*');
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } catch {
    // ignore
  }
}
