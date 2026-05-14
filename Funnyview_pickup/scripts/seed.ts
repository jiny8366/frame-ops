/**
 * 데모 시드 스크립트.
 * 사용: DATABASE_URL=... npx tsx scripts/seed.ts
 *
 * 생성:
 *  - users: 픽업서비스 업체 직원 1, 가맹점 직원 3 (가맹점별 1명)
 *  - stores: 픽업가맹점 3개
 *  - lenses: 4종 (1day spherical, 1day color, 2week toric, 1month spherical)
 *  - lens_variants: 각 렌즈의 주요 도수 SKU
 *  - inventory: 모든 SKU에 30개 초기 재고
 */
import 'dotenv/config';
import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  inventory,
  inventoryMovements,
  lensVariants,
  lensBarcodes,
  lenses,
  stores,
  users,
} from '../src/db/schema';
import { generateSku } from '../src/lib/utils/sku';

const PASSWORD_DEFAULT = 'pickup1234!';

async function ensureUser(phone: string, role: 'warehouse_staff' | 'store_staff', storeId?: string) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  if (existing[0]) return existing[0].id;
  const passwordHash = await hash(PASSWORD_DEFAULT, 10);
  const [u] = await db
    .insert(users)
    .values({ phone, passwordHash, role, storeId: storeId ?? null })
    .returning({ id: users.id });
  return u.id;
}

async function ensureStore(code: string, name: string, phone: string, addressLine1: string, lat: number, lng: number) {
  const existing = await db.select({ id: stores.id }).from(stores).where(eq(stores.code, code)).limit(1);
  if (existing[0]) return existing[0].id;
  const [s] = await db
    .insert(stores)
    .values({
      code,
      name,
      phone,
      addressLine1,
      latitude: String(lat),
      longitude: String(lng),
      commissionRate: '10.00',
      businessNumber: '000-00-00000',
      representativeName: '대표자',
    })
    .returning({ id: stores.id });
  return s.id;
}

async function ensureLens(input: {
  productCode: string;
  brand: string;
  name: string;
  lensType: 'spherical' | 'toric' | 'multifocal' | 'color' | 'circle';
  replacementCycle: '1day' | '2week' | '1month';
  baseCurve: string;
  diameter: string;
  waterContent: string;
  piecesPerBox: number;
  price: number;
  cost: number;
  sphereMin: string;
  sphereMax: string;
}) {
  const existing = await db.select({ id: lenses.id }).from(lenses).where(eq(lenses.productCode, input.productCode)).limit(1);
  if (existing[0]) return existing[0].id;
  const [l] = await db
    .insert(lenses)
    .values({
      productCode: input.productCode,
      brand: input.brand,
      name: input.name,
      lensType: input.lensType,
      replacementCycle: input.replacementCycle,
      baseCurve: input.baseCurve,
      diameter: input.diameter,
      waterContent: input.waterContent,
      piecesPerBox: input.piecesPerBox,
      price: input.price,
      cost: input.cost,
      sphereMin: input.sphereMin,
      sphereMax: input.sphereMax,
      sphereStep: '0.25',
    })
    .returning({ id: lenses.id });
  return l.id;
}

async function ensureVariant(
  lensId: string,
  productCode: string,
  rx: { sphere: number; cylinder?: number; axis?: number },
) {
  const sku = generateSku(productCode, rx);
  const existing = await db.select({ id: lensVariants.id }).from(lensVariants).where(eq(lensVariants.sku, sku)).limit(1);
  if (existing[0]) return existing[0].id;
  const [v] = await db
    .insert(lensVariants)
    .values({
      lensId,
      sku,
      sphere: String(rx.sphere),
      cylinder: rx.cylinder != null ? String(rx.cylinder) : null,
      axis: rx.axis ?? null,
    })
    .returning({ id: lensVariants.id });

  // 바코드 생성 (EAN13 mock)
  const barcode = `880${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 10)}`;
  await db.insert(lensBarcodes).values({
    variantId: v.id,
    barcode,
    barcodeType: 'EAN13',
    isPrimary: true,
  });

  // 초기 재고 30
  await db.insert(inventory).values({
    variantId: v.id,
    quantityOnHand: 30,
    quantityReserved: 0,
    safetyStock: 10,
    reorderPoint: 15,
  });
  await db.insert(inventoryMovements).values({
    variantId: v.id,
    movementType: 'inbound',
    quantity: 30,
    note: 'seed_initial',
  });

  return v.id;
}

async function main() {
  console.log('[seed] starting...');

  // 1) Stores
  const store1 = await ensureStore('ST-0001', '강남 본점', '02-1234-0001', '서울 강남구 테헤란로 100', 37.5006, 127.0364);
  const store2 = await ensureStore('ST-0002', '홍대 지점', '02-1234-0002', '서울 마포구 양화로 100', 37.5563, 126.9220);
  const store3 = await ensureStore('ST-0003', '판교 지점', '031-1234-0003', '경기 성남시 분당구 판교역로 100', 37.3947, 127.1112);
  console.log('[seed] stores:', { store1, store2, store3 });

  // 2) Users
  const warehouse = await ensureUser('01000000001', 'warehouse_staff');
  const staff1 = await ensureUser('01000000002', 'store_staff', store1);
  const staff2 = await ensureUser('01000000003', 'store_staff', store2);
  const staff3 = await ensureUser('01000000004', 'store_staff', store3);
  console.log('[seed] users:', { warehouse, staff1, staff2, staff3 });

  // 3) Lenses
  const acuOas = await ensureLens({
    productCode: 'ACU-OAS-1D',
    brand: 'Acuvue',
    name: '오아시스 원데이',
    lensType: 'spherical',
    replacementCycle: '1day',
    baseCurve: '8.50',
    diameter: '14.30',
    waterContent: '38.00',
    piecesPerBox: 30,
    price: 35000,
    cost: 22000,
    sphereMin: '-12.00',
    sphereMax: '0.00',
  });
  const bioInfinity = await ensureLens({
    productCode: 'BIO-INF-2W',
    brand: 'CooperVision',
    name: 'Biofinity 2주',
    lensType: 'spherical',
    replacementCycle: '2week',
    baseCurve: '8.60',
    diameter: '14.00',
    waterContent: '48.00',
    piecesPerBox: 6,
    price: 28000,
    cost: 17000,
    sphereMin: '-10.00',
    sphereMax: '+6.00',
  });
  const toricLens = await ensureLens({
    productCode: 'ACU-AST-1D',
    brand: 'Acuvue',
    name: '난시용 원데이',
    lensType: 'toric',
    replacementCycle: '1day',
    baseCurve: '8.50',
    diameter: '14.50',
    waterContent: '38.00',
    piecesPerBox: 30,
    price: 42000,
    cost: 28000,
    sphereMin: '-9.00',
    sphereMax: '0.00',
  });
  const colorLens = await ensureLens({
    productCode: 'OLE-CHC-1M',
    brand: 'Olens',
    name: '초코 컬러렌즈',
    lensType: 'color',
    replacementCycle: '1month',
    baseCurve: '8.60',
    diameter: '14.20',
    waterContent: '38.00',
    piecesPerBox: 2,
    price: 22000,
    cost: 12000,
    sphereMin: '-8.00',
    sphereMax: '0.00',
  });
  console.log('[seed] lenses created');

  // 4) Variants
  const sphericalRange = [-1.0, -1.5, -2.0, -2.5, -3.0, -3.5, -4.0, -4.5, -5.0];
  for (const s of sphericalRange) {
    await ensureVariant(acuOas, 'ACU-OAS-1D', { sphere: s });
    await ensureVariant(bioInfinity, 'BIO-INF-2W', { sphere: s });
    await ensureVariant(colorLens, 'OLE-CHC-1M', { sphere: s });
  }
  const toricCases = [
    { sphere: -2.0, cylinder: -0.75, axis: 90 },
    { sphere: -2.5, cylinder: -1.25, axis: 180 },
    { sphere: -3.0, cylinder: -0.75, axis: 180 },
    { sphere: -3.5, cylinder: -1.25, axis: 90 },
  ];
  for (const c of toricCases) {
    await ensureVariant(toricLens, 'ACU-AST-1D', c);
  }
  console.log('[seed] variants + inventory done');

  console.log('\n[seed] 완료!\n');
  console.log('테스트 계정 (비밀번호: ' + PASSWORD_DEFAULT + ')');
  console.log('  픽업서비스 업체   : 01000000001  /login/warehouse');
  console.log('  강남 본점 직원     : 01000000002  /login/store');
  console.log('  홍대 지점 직원     : 01000000003  /login/store');
  console.log('  판교 지점 직원     : 01000000004  /login/store');
  console.log('  고객              : /register 에서 회원가입');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
