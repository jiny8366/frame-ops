-- FRAME OPS Phase 2 — fo_sale_items 테이블 + fo_products.stock_quantity 컬럼
-- 참고: PHASE2_WORK_ORDER_FINAL.md TASK 0-1
-- 철학: "안경원은 편의점이 아니다" — 재고 0/음수여도 판매 가능, 음수 = 매입 대기

begin;

-- ============================================================
-- 1. fo_sale_items 테이블 신규 생성
-- ============================================================
create table if not exists fo_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references fo_sales(id) on delete cascade,
  product_id uuid not null references fo_products(id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  unit_price int not null check (unit_price >= 0),
  discount_amount int not null default 0 check (discount_amount >= 0),
  line_note text,
  created_at timestamptz not null default now()
);

comment on table fo_sale_items is '판매 품목 상세';
comment on column fo_sale_items.quantity is '판매 수량 (양수)';
comment on column fo_sale_items.unit_price is '판매 시점 단가';
comment on column fo_sale_items.discount_amount is '품목별 개별 할인';
comment on column fo_sale_items.line_note is '라인별 메모 (옵션)';

-- 인덱스
create index if not exists idx_fo_sale_items_sale
  on fo_sale_items(sale_id);
create index if not exists idx_fo_sale_items_product
  on fo_sale_items(product_id);
create index if not exists idx_fo_sale_items_created
  on fo_sale_items(created_at desc);

-- ============================================================
-- 2. fo_products에 재고 컬럼 추가
-- ============================================================
alter table fo_products
  add column if not exists stock_quantity int default null;

comment on column fo_products.stock_quantity is
  '재고 수량. NULL=추적 안 함, 양수=매장 보유, 0=없음, 음수=매입 대기 건수';

-- 음수 재고(발주 필요) 조회용 partial index
create index if not exists idx_fo_products_stock_negative
  on fo_products(stock_quantity, style_code)
  where stock_quantity is not null and stock_quantity < 0;

-- 재고 0 조회용
create index if not exists idx_fo_products_stock_zero
  on fo_products(style_code)
  where stock_quantity = 0;

commit;
