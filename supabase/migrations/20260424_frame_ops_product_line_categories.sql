-- FRAME OPS — 상품 라인(FRM/SUN) + 카테고리 마스터(메탈·콤비… + 사용자 추가)

begin;

create table if not exists public.fo_product_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_fo_product_categories_label_lower
  on public.fo_product_categories (lower(trim(label)));

alter table public.fo_products
  add column if not exists product_line text;

alter table public.fo_products
  drop constraint if exists fo_products_product_line_check;

alter table public.fo_products
  add constraint fo_products_product_line_check
  check (product_line is null or product_line in ('FRM', 'SUN'));

drop index if exists public.uq_fo_products_brand_style_color;

create unique index if not exists uq_fo_products_brand_style_color_line
  on public.fo_products (brand_id, style_code, color_code, product_line)
  where brand_id is not null
    and coalesce(trim(style_code), '') <> ''
    and coalesce(trim(color_code), '') <> ''
    and product_line is not null;

alter table public.fo_product_categories enable row level security;

do $pol$
begin
  execute 'drop policy if exists fo_dev_authenticated_all on public.fo_product_categories';
  execute 'create policy fo_dev_authenticated_all on public.fo_product_categories for all to authenticated using (true) with check (true)';
  execute 'drop policy if exists fo_dev_anon_all on public.fo_product_categories';
  execute 'create policy fo_dev_anon_all on public.fo_product_categories for all to anon using (true) with check (true)';
end $pol$;

grant select, insert, update, delete on public.fo_product_categories to anon, authenticated;

insert into public.fo_product_categories (label, sort_order)
select v.label, v.ord
from (
  values
    ('메탈', 10),
    ('콤비', 20),
    ('TR', 30),
    ('울템', 40),
    ('아세테이트', 50),
    ('티탄', 60),
    ('베타티탄', 70)
) as v(label, ord)
where not exists (
  select 1 from public.fo_product_categories c
  where lower(trim(c.label)) = lower(trim(v.label))
);

commit;
