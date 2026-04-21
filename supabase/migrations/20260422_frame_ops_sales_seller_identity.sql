-- POS 판매 시 담당자(스태프) 식별 — 비밀번호 확인 후 저장되는 값

begin;

alter table public.fo_sales
  add column if not exists seller_user_id uuid references auth.users (id) on delete set null;

alter table public.fo_sales
  add column if not exists seller_label text;

comment on column public.fo_sales.seller_user_id is 'Auth 사용자 UUID (POS 저장 시 본인 확인)';
comment on column public.fo_sales.seller_label is '저장 시점 담당자 표시용 스냅샷 (이름·이메일 등)';

create index if not exists idx_fo_sales_seller_user on public.fo_sales (seller_user_id)
  where seller_user_id is not null;

commit;
