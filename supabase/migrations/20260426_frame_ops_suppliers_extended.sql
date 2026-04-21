-- FRAME OPS — 매입처 확장 정보 + 취급 브랜드 연결

begin;

alter table public.fo_suppliers
  add column if not exists business_number text,
  add column if not exists address text,
  add column if not exists contact text,
  add column if not exists memo text,
  add column if not exists active boolean not null default true;

create index if not exists idx_fo_suppliers_active
  on public.fo_suppliers (active)
  where active = true;

create table if not exists public.fo_supplier_brands (
  supplier_id uuid not null references public.fo_suppliers (id) on delete cascade,
  brand_id uuid not null references public.fo_brands (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supplier_id, brand_id)
);

create index if not exists idx_fo_supplier_brands_brand
  on public.fo_supplier_brands (brand_id);

alter table public.fo_supplier_brands enable row level security;

do $pol$
begin
  execute 'drop policy if exists fo_dev_authenticated_all on public.fo_supplier_brands';
  execute
    'create policy fo_dev_authenticated_all on public.fo_supplier_brands '
    'for all to authenticated using (true) with check (true)';
  execute 'drop policy if exists fo_dev_anon_all on public.fo_supplier_brands';
  execute
    'create policy fo_dev_anon_all on public.fo_supplier_brands '
    'for all to anon using (true) with check (true)';
end $pol$;

grant select, insert, update, delete on public.fo_supplier_brands to anon, authenticated;

commit;
