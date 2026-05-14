import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { inventoryMovementTypeEnum } from './enums';
import { lensVariants } from './lenses';
import { users } from './users';

/**
 * 픽업서비스 업체(중앙 창고)의 SKU별 현재 재고.
 * available = quantity_on_hand - quantity_reserved (계산 컬럼은 미사용, 쿼리에서 계산)
 */
export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => lensVariants.id, { onDelete: 'cascade' }),
    quantityOnHand: integer('quantity_on_hand').default(0).notNull(),
    quantityReserved: integer('quantity_reserved').default(0).notNull(),
    safetyStock: integer('safety_stock').default(0).notNull(), // 안전재고 (이하 시 알람)
    reorderPoint: integer('reorder_point').default(0).notNull(), // 발주점
    location: text('location'), // 창고 위치 코드 (예: A-12-3)
    lastCountedAt: timestamp('last_counted_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    variantUnique: uniqueIndex('inventory_variant_unique').on(t.variantId),
    onHandIdx: index('inventory_on_hand_idx').on(t.quantityOnHand),
    onHandNonNegative: check(
      'inventory_on_hand_non_negative',
      sql`${t.quantityOnHand} >= 0`,
    ),
    reservedNonNegative: check(
      'inventory_reserved_non_negative',
      sql`${t.quantityReserved} >= 0`,
    ),
  }),
);

/**
 * 입출고 이력 (Append-only).
 * 모든 재고 변동의 단일 진실 원천. 재고 수량은 이 테이블의 합산으로 재계산 가능.
 */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => lensVariants.id),
    movementType: inventoryMovementTypeEnum('movement_type').notNull(),
    quantity: integer('quantity').notNull(), // 부호 포함 (입고+ / 출고-)

    // 참조 (다형성)
    referenceType: text('reference_type'), // 'order' | 'inbound' | 'adjustment' | 'return'
    referenceId: uuid('reference_id'),

    note: text('note'),
    performedBy: uuid('performed_by').references(() => users.id),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    variantIdx: index('inventory_movements_variant_idx').on(
      t.variantId,
      t.performedAt,
    ),
    referenceIdx: index('inventory_movements_reference_idx').on(
      t.referenceType,
      t.referenceId,
    ),
    performedAtIdx: index('inventory_movements_performed_at_idx').on(
      t.performedAt,
    ),
  }),
);

export type Inventory = typeof inventory.$inferSelect;
export type NewInventory = typeof inventory.$inferInsert;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
