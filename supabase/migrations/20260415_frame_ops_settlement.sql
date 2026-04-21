-- FRAME OPS: 일자별 정산(잠금) — 정산된 영업일은 해당 지점에서 전표 입력 불가

begin;

create table if not exists public.fo_settlements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete cascade,
  business_date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (store_id, business_date)
);

create index if not exists idx_fo_settlements_store_date on public.fo_settlements (store_id, business_date desc);

alter table public.fo_settlements enable row level security;

drop policy if exists fo_dev_authenticated_all on public.fo_settlements;
create policy fo_dev_authenticated_all
on public.fo_settlements for all to authenticated using (true) with check (true);

drop policy if exists fo_dev_anon_all on public.fo_settlements;
create policy fo_dev_anon_all
on public.fo_settlements for all to anon using (true) with check (true);

grant select, insert, update, delete on public.fo_settlements to anon, authenticated;

commit;
