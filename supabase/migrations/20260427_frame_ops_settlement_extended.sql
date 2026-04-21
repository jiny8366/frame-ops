-- FRAME OPS — 정산 확장 필드 (카드매출, 지출합, 입금처리, 현금시재)

begin;

alter table public.fo_settlements
  add column if not exists cash_on_hand integer not null default 0,
  add column if not exists card_sales integer not null default 0,
  add column if not exists total_expense integer not null default 0,
  add column if not exists deposit integer not null default 0;

commit;
