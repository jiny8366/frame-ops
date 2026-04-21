-- FRAME OPS — 브랜드 마스터 + 상품(제품번호·컬러·브랜드 FK)

begin;

create table if not exists public.fo_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_fo_brands_name_lower
  on public.fo_brands (lower(trim(name)));

drop trigger if exists trg_fo_brands_updated on public.fo_brands;
create trigger trg_fo_brands_updated
before update on public.fo_brands
for each row execute function public.set_updated_at();

alter table public.fo_products
  add column if not exists brand_id uuid references public.fo_brands (id) on delete set null;
alter table public.fo_products
  add column if not exists style_code text;
alter table public.fo_products
  add column if not exists color_code text;

create index if not exists idx_fo_products_brand on public.fo_products (brand_id);
create index if not exists idx_fo_products_brand_style on public.fo_products (brand_id, style_code);

create unique index if not exists uq_fo_products_brand_style_color
  on public.fo_products (brand_id, style_code, color_code)
  where brand_id is not null
    and coalesce(trim(style_code), '') <> ''
    and coalesce(trim(color_code), '') <> '';

alter table public.fo_brands enable row level security;

do $pol$
begin
  execute 'drop policy if exists fo_dev_authenticated_all on public.fo_brands';
  execute 'create policy fo_dev_authenticated_all on public.fo_brands for all to authenticated using (true) with check (true)';
  execute 'drop policy if exists fo_dev_anon_all on public.fo_brands';
  execute 'create policy fo_dev_anon_all on public.fo_brands for all to anon using (true) with check (true)';
end $pol$;

grant select, insert, update, delete on public.fo_brands to anon, authenticated;

commit;
