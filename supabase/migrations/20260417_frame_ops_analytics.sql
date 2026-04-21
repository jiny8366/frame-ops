-- FRAME OPS: 통계(판매자별) — POS seller_code

begin;

alter table public.fo_sales
  add column if not exists seller_code text;

create index if not exists idx_fo_sales_seller_code on public.fo_sales (seller_code)
  where seller_code is not null and seller_code <> '';

commit;
