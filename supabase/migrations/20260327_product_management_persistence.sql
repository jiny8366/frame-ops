begin;

create extension if not exists pgcrypto;

-- 브랜드(대분류 귀속)
create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  brand_code text not null,
  brand_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, brand_code)
);

create index if not exists idx_product_brands_category on public.product_brands(category);
create index if not exists idx_product_brands_code on public.product_brands(brand_code);

-- 상품코드 마스터
create table if not exists public.product_items (
  product_id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  category text not null,
  brand text not null,
  line_code text,
  attr_code text,
  lens_power_code text default '',
  launch_date date,
  name text not null,
  status text not null default 'active',
  standard_price integer not null default 0,
  sale_price integer not null default 0,
  cost_price integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_items_category_brand on public.product_items(category, brand);
create index if not exists idx_product_items_created_at on public.product_items(created_at desc);

-- 제품별 도수코드 매핑(JSON 배열)
create table if not exists public.product_power_map (
  product_code text primary key references public.product_items(product_code) on delete cascade,
  codes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 제품별 도수가격 규칙(JSON 배열)
create table if not exists public.product_power_price_rules (
  product_code text primary key references public.product_items(product_code) on delete cascade,
  rules jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at 트리거 재사용
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    as $f$
    begin
      new.updated_at = now();
      return new;
    end;
    $f$;
  end if;
end $$;

drop trigger if exists trg_product_brands_set_updated_at on public.product_brands;
create trigger trg_product_brands_set_updated_at
before update on public.product_brands
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_items_set_updated_at on public.product_items;
create trigger trg_product_items_set_updated_at
before update on public.product_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_power_map_set_updated_at on public.product_power_map;
create trigger trg_product_power_map_set_updated_at
before update on public.product_power_map
for each row execute function public.set_updated_at();

drop trigger if exists trg_product_power_price_rules_set_updated_at on public.product_power_price_rules;
create trigger trg_product_power_price_rules_set_updated_at
before update on public.product_power_price_rules
for each row execute function public.set_updated_at();

-- RLS
alter table public.product_brands enable row level security;
alter table public.product_items enable row level security;
alter table public.product_power_map enable row level security;
alter table public.product_power_price_rules enable row level security;

drop policy if exists dev_authenticated_all on public.product_brands;
create policy dev_authenticated_all
on public.product_brands
for all
to authenticated
using (true)
with check (true);

drop policy if exists dev_authenticated_all on public.product_items;
create policy dev_authenticated_all
on public.product_items
for all
to authenticated
using (true)
with check (true);

drop policy if exists dev_authenticated_all on public.product_power_map;
create policy dev_authenticated_all
on public.product_power_map
for all
to authenticated
using (true)
with check (true);

drop policy if exists dev_authenticated_all on public.product_power_price_rules;
create policy dev_authenticated_all
on public.product_power_price_rules
for all
to authenticated
using (true)
with check (true);

drop policy if exists dev_anon_all on public.product_brands;
create policy dev_anon_all
on public.product_brands
for all
to anon
using (true)
with check (true);

drop policy if exists dev_anon_all on public.product_items;
create policy dev_anon_all
on public.product_items
for all
to anon
using (true)
with check (true);

drop policy if exists dev_anon_all on public.product_power_map;
create policy dev_anon_all
on public.product_power_map
for all
to anon
using (true)
with check (true);

drop policy if exists dev_anon_all on public.product_power_price_rules;
create policy dev_anon_all
on public.product_power_price_rules
for all
to anon
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.product_brands to anon, authenticated;
grant select, insert, update, delete on public.product_items to anon, authenticated;
grant select, insert, update, delete on public.product_power_map to anon, authenticated;
grant select, insert, update, delete on public.product_power_price_rules to anon, authenticated;

commit;
