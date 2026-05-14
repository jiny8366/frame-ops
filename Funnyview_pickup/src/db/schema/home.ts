import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  homeSectionEventTypeEnum,
  homeSectionKindEnum,
} from './enums';
import { users } from './users';

/**
 * 홈화면 CMS 섹션.
 * 관리자가 UI에서 추가/편집/순서 변경/노출 일정 설정.
 * config 는 kind 별 스키마 (lib/home/section-config.ts 참조).
 */
export const homeSections = pgTable(
  'home_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: homeSectionKindEnum('kind').notNull(),
    title: text('title'), // 관리자용 식별 라벨 (예: "8월 여름 한정 카드")
    config: jsonb('config').notNull(), // kind 별 다른 스키마

    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    // 스케줄링 (둘 다 NULL 이면 항상)
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    // A/B 변형 (선택; control / a / b ...)
    variant: text('variant'),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    activeIdx: index('home_sections_active_idx').on(t.isActive, t.sortOrder),
    kindIdx: index('home_sections_kind_idx').on(t.kind),
  }),
);

/**
 * 섹션별 노출/클릭 이벤트.
 * 분석 화면에서 CTR (click/impression) · 전환율 계산.
 * 익명 방문자도 추적 가능 (sessionId).
 */
export const homeSectionEvents = pgTable(
  'home_section_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => homeSections.id, { onDelete: 'cascade' }),
    eventType: homeSectionEventTypeEnum('event_type').notNull(),

    userId: uuid('user_id').references(() => users.id),
    sessionId: text('session_id'),

    variant: text('variant'),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),

    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sectionEventIdx: index('hse_section_event_idx').on(
      t.sectionId,
      t.eventType,
      t.occurredAt,
    ),
    occurredAtIdx: index('hse_occurred_at_idx').on(t.occurredAt),
  }),
);

export type HomeSection = typeof homeSections.$inferSelect;
export type NewHomeSection = typeof homeSections.$inferInsert;
export type HomeSectionEvent = typeof homeSectionEvents.$inferSelect;
export type NewHomeSectionEvent = typeof homeSectionEvents.$inferInsert;
