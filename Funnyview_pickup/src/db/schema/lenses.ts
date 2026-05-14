import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { lensTypeEnum, replacementCycleEnum } from './enums';

/**
 * 콘택트렌즈 제품 마스터 (브랜드/제품군 단위).
 * 도수별 SKU 는 lens_variants 에 저장.
 */
export const lenses = pgTable(
  'lenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productCode: text('product_code').notNull(), // 내부 제품 코드
    brand: text('brand').notNull(),
    name: text('name').notNull(),
    lensType: lensTypeEnum('lens_type').notNull(),
    replacementCycle: replacementCycleEnum('replacement_cycle').notNull(),

    // 렌즈 스펙
    baseCurve: numeric('base_curve', { precision: 4, scale: 2 }), // BC
    diameter: numeric('diameter', { precision: 4, scale: 2 }), // DIA
    waterContent: numeric('water_content', { precision: 5, scale: 2 }), // 함수율 %
    material: text('material'),

    // 박스 단위
    piecesPerBox: integer('pieces_per_box').default(1).notNull(), // 1박스 매수

    // 도수 범위 (lens_variants 생성 가이드)
    sphereMin: numeric('sphere_min', { precision: 4, scale: 2 }),
    sphereMax: numeric('sphere_max', { precision: 4, scale: 2 }),
    sphereStep: numeric('sphere_step', { precision: 4, scale: 2 }).default(
      '0.25',
    ),
    cylinderMin: numeric('cylinder_min', { precision: 4, scale: 2 }),
    cylinderMax: numeric('cylinder_max', { precision: 4, scale: 2 }),
    cylinderStep: numeric('cylinder_step', { precision: 4, scale: 2 }).default(
      '0.25',
    ),
    axisStep: integer('axis_step').default(10), // 축 간격

    // 가격
    price: integer('price').notNull(), // 판매가 (원)
    cost: integer('cost'), // 원가 (영업이익 계산)

    imageUrl: text('image_url'),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    productCodeUnique: uniqueIndex('lenses_product_code_unique').on(
      t.productCode,
    ),
    brandIdx: index('lenses_brand_idx').on(t.brand),
    activeIdx: index('lenses_active_idx').on(t.isActive),
  }),
);

/**
 * 도수별 SKU.
 * (lens_id, sphere, cylinder, axis, add_power) 조합이 유일.
 * NULL 도 NOT DISTINCT 로 동등 비교 (PG 15+).
 */
export const lensVariants = pgTable(
  'lens_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lensId: uuid('lens_id')
      .notNull()
      .references(() => lenses.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(), // 내부 SKU 코드 (예: ACU-OAS-S-100-C-075-A-180)

    sphere: numeric('sphere', { precision: 4, scale: 2 }).notNull(), // 원용
    cylinder: numeric('cylinder', { precision: 4, scale: 2 }), // 난시
    axis: integer('axis'), // 축
    addPower: numeric('add_power', { precision: 4, scale: 2 }), // 가입도

    // 가격 오버라이드 (도수별 가격이 다른 경우)
    priceOverride: integer('price_override'),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    // SKU 자체가 유일하므로 (lensId, sph, cyl, axis, add) 결정적 생성을 통해 중복 방지.
    skuUnique: uniqueIndex('lens_variants_sku_unique').on(t.sku),
    lensIdx: index('lens_variants_lens_idx').on(t.lensId),
    sphereIdx: index('lens_variants_sphere_idx').on(
      t.lensId,
      t.sphere,
      t.cylinder,
      t.axis,
    ),
  }),
);

/**
 * 바코드 (SKU 1개당 N개 가능 — 제조사/유통 바코드 분리).
 */
export const lensBarcodes = pgTable(
  'lens_barcodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => lensVariants.id, { onDelete: 'cascade' }),
    barcode: text('barcode').notNull(),
    barcodeType: text('barcode_type'), // 'EAN13' | 'CODE128' | 'QR' | 'manufacturer'
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    barcodeUnique: uniqueIndex('lens_barcodes_barcode_unique').on(t.barcode),
    variantIdx: index('lens_barcodes_variant_idx').on(t.variantId),
  }),
);

export type Lens = typeof lenses.$inferSelect;
export type NewLens = typeof lenses.$inferInsert;
export type LensVariant = typeof lensVariants.$inferSelect;
export type NewLensVariant = typeof lensVariants.$inferInsert;
export type LensBarcode = typeof lensBarcodes.$inferSelect;
export type NewLensBarcode = typeof lensBarcodes.$inferInsert;
