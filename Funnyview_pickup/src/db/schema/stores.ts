import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * 픽업가맹점 마스터.
 * 카카오맵/네이버지도/T맵 URL 은 미리 저장 가능, 미저장 시 lat/lng 로 동적 생성.
 */
export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(), // 가맹점 코드 (예: ST-0001)
    name: text('name').notNull(), // 가맹점명
    phone: text('phone').notNull(), // 가맹점 전화번호

    // 주소
    postalCode: text('postal_code'),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),

    // 지도 URL (선택, 없으면 lat/lng 로 동적 생성)
    kakaoMapUrl: text('kakao_map_url'),
    naverMapUrl: text('naver_map_url'),
    tmapUrl: text('tmap_url'),

    // 영업 시간 — {mon: {open: '09:00', close: '19:00'}, ...}
    businessHours: jsonb('business_hours'),

    // 사업자 정보 (거래전표용)
    businessNumber: text('business_number'),
    representativeName: text('representative_name'),

    // 정산 수수료율 (%) — 픽업가맹점에 지급하는 수수료율
    commissionRate: numeric('commission_rate', { precision: 5, scale: 2 })
      .default('0')
      .notNull(),

    // 픽업 처리 우선순위 (낮을수록 우선 노출)
    sortOrder: integer('sort_order').default(0).notNull(),

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
    codeUnique: uniqueIndex('stores_code_unique').on(t.code),
    nameIdx: index('stores_name_idx').on(t.name),
    activeIdx: index('stores_active_idx').on(t.isActive),
  }),
);

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;
