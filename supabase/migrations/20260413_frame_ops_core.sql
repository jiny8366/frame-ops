-- 안경테 소매·재고·POS (FRAME OPS)
-- 기존 CRM 렌즈 상품(product_items, product_power_*)과 테이블·도메인 분리

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
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

-- 지점
create table if not exists public.fo_stores (
  id uuid primary key default gen_random_uuid(),
  store_code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fo_stores_active on public.fo_stores (active) where active = true;

-- 매입처 (통계·상품 마스터용)
create table if not exists public.fo_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 안경테 상품 마스터 (내부 상품코드 규칙은 앱/운영에서 관리)
create table if not exists public.fo_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  barcode text,
  display_name text not null,
  category text not null default '',
  supplier_id uuid references public.fo_suppliers (id) on delete set null,
  cost_price integer not null default 0,
  suggested_retail integer not null default 0,
  sale_price integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fo_products_category on public.fo_products (category);
create index if not exists idx_fo_products_barcode on public.fo_products (barcode) where barcode is not null and barcode <> '';

-- 지점별 재고 (음수 허용: 선판매 후입고)
create table if not exists public.fo_stock (
  store_id uuid not null references public.fo_stores (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete cascade,
  quantity numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);

-- 할인 유형 마스터 (POS 드롭다운)
create table if not exists public.fo_discount_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 판매 전표
create table if not exists public.fo_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  sold_at timestamptz not null default now(),
  cash_amount integer not null default 0,
  card_amount integer not null default 0,
  discount_total integer not null default 0,
  discount_type_code text,
  idempotency_key text unique,
  clerk_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_sales_store_sold on public.fo_sales (store_id, sold_at desc);

create table if not exists public.fo_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.fo_sales (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_price integer not null,
  line_discount integer not null default 0,
  cost_price_at_sale integer
);

create index if not exists idx_fo_sale_lines_sale on public.fo_sale_lines (sale_id);

-- updated_at
drop trigger if exists trg_fo_stores_updated on public.fo_stores;
create trigger trg_fo_stores_updated
before update on public.fo_stores
for each row execute function public.set_updated_at();

drop trigger if exists trg_fo_suppliers_updated on public.fo_suppliers;
create trigger trg_fo_suppliers_updated
before update on public.fo_suppliers
for each row execute function public.set_updated_at();

drop trigger if exists trg_fo_products_updated on public.fo_products;
create trigger trg_fo_products_updated
before update on public.fo_products
for each row execute function public.set_updated_at();

drop trigger if exists trg_fo_stock_updated on public.fo_stock;
create trigger trg_fo_stock_updated
before update on public.fo_stock
for each row execute function public.set_updated_at();

-- RLS (CRM과 동일: 개발용 완화 정책 — 프로덕션에서는 서비스롤 전용 또는 정책 재작성)
alter table public.fo_stores enable row level security;
alter table public.fo_suppliers enable row level security;
alter table public.fo_products enable row level security;
alter table public.fo_stock enable row level security;
alter table public.fo_discount_types enable row level security;
alter table public.fo_sales enable row level security;
alter table public.fo_sale_lines enable row level security;

do $pol$
declare
  t text;
begin
  foreach t in array array[
    'fo_stores', 'fo_suppliers', 'fo_products', 'fo_stock',
    'fo_discount_types', 'fo_sales', 'fo_sale_lines'
  ]
  loop
    execute format('drop policy if exists fo_dev_authenticated_all on public.%I', t);
    execute format(
      'create policy fo_dev_authenticated_all on public.%I for all to authenticated using (true) with check (true)',
      t
    );
    execute format('drop policy if exists fo_dev_anon_all on public.%I', t);
    execute format(
      'create policy fo_dev_anon_all on public.%I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $pol$;

grant select, insert, update, delete on public.fo_stores to anon, authenticated;
grant select, insert, update, delete on public.fo_suppliers to anon, authenticated;
grant select, insert, update, delete on public.fo_products to anon, authenticated;
grant select, insert, update, delete on public.fo_stock to anon, authenticated;
grant select, insert, update, delete on public.fo_discount_types to anon, authenticated;
grant select, insert, update, delete on public.fo_sales to anon, authenticated;
grant select, insert, update, delete on public.fo_sale_lines to anon, authenticated;

-- 기본 할인 유형
insert into public.fo_discount_types (code, label, sort_order, active)
values
  ('coupon', '쿠폰', 10, true),
  ('staff', '직원 할인', 20, true),
  ('promo', '행사', 30, true)
on conflict (code) do nothing;

commit;
