import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { eyeSideEnum, genderEnum } from './enums';
import { users } from './users';

/**
 * 고객 마스터.
 * users 와 1:1 매핑 (userId unique).
 * referrerId 는 추천인 고객을 가리키는 자기참조 FK.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gender: genderEnum('gender'),
    birthDate: date('birth_date'),
    phone: text('phone').notNull(),

    // 주소
    postalCode: text('postal_code'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),

    // 추천인
    referrerCode: text('referrer_code'), // 본인의 추천코드 (지인 공유용)
    referredById: uuid('referred_by_id').references(
      (): AnyPgColumn => customers.id,
      { onDelete: 'set null' },
    ),
    referredByCode: text('referred_by_code'), // 가입 시 입력한 추천인 코드 (텍스트 보존)

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    userUnique: uniqueIndex('customers_user_id_unique').on(t.userId),
    phoneIdx: index('customers_phone_idx').on(t.phone),
    referrerCodeIdx: uniqueIndex('customers_referrer_code_idx')
      .on(t.referrerCode)
      .where(sql`referrer_code IS NOT NULL`),
    referredByIdIdx: index('customers_referred_by_id_idx').on(t.referredById),
  }),
);

/**
 * 고객 도수 이력 (재주문 편의용).
 * 좌/우 각각 별도 row.
 */
export const customerPrescriptions = pgTable(
  'customer_prescriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    eyeSide: eyeSideEnum('eye_side').notNull(), // 'left' | 'right' (애플리케이션에서 강제)
    sphere: numeric('sphere', { precision: 4, scale: 2 }).notNull(), // 원용 (-12.00 ~ +6.00)
    cylinder: numeric('cylinder', { precision: 4, scale: 2 }), // 난시 (-2.75 ~ 0)
    axis: integer('axis'), // 축 (0 ~ 180)
    addPower: numeric('add_power', { precision: 4, scale: 2 }), // 가입도(다초점)
    source: text('source'), // 'self_input' | 'doctor' | 'last_order'
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    customerIdx: index('customer_prescriptions_customer_idx').on(
      t.customerId,
      t.eyeSide,
    ),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type CustomerPrescription = typeof customerPrescriptions.$inferSelect;
export type NewCustomerPrescription = typeof customerPrescriptions.$inferInsert;
