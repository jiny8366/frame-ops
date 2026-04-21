-- Add prescriptions tables (header + eye details)
begin;

create extension if not exists pgcrypto;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'rx_kind_enum') then
    create type public.rx_kind_enum as enum ('new', 'old');
  end if;
  if not exists (select 1 from pg_type where typname = 'eye_enum') then
    create type public.eye_enum as enum ('R', 'L');
  end if;
  if not exists (select 1 from pg_type where typname = 'prism_horizontal_enum') then
    create type public.prism_horizontal_enum as enum ('BI', 'BO');
  end if;
  if not exists (select 1 from pg_type where typname = 'prism_vertical_enum') then
    create type public.prism_vertical_enum as enum ('BU', 'BD');
  end if;
end $$;

-- Header table
create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind public.rx_kind_enum not null,
  dominant_eye public.eye_enum,
  created_at timestamptz not null default now()
);

create index if not exists idx_prescriptions_customer_id_created_at
  on public.prescriptions(customer_id, created_at desc);

-- Detail rows (one per eye)
create table if not exists public.prescription_details (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  eye public.eye_enum not null,

  sph numeric(5,2),
  cyl numeric(5,2),
  axis numeric(5,2),
  pd_far numeric(5,2) not null,
  pd_near numeric(5,2),
  add_power numeric(5,2),
  sc numeric(5,2),
  cc numeric(5,2),

  prism_horizontal public.prism_horizontal_enum,
  prism_horizontal_value numeric(5,2),
  prism_vertical public.prism_vertical_enum,
  prism_vertical_value numeric(5,2),

  created_at timestamptz not null default now()
);

create unique index if not exists ux_prescription_details_prescription_eye
  on public.prescription_details(prescription_id, eye);

create index if not exists idx_prescription_details_prescription_id
  on public.prescription_details(prescription_id);

-- RLS
alter table public.prescriptions enable row level security;
alter table public.prescription_details enable row level security;

drop policy if exists dev_authenticated_all on public.prescriptions;
create policy dev_authenticated_all
on public.prescriptions
for all
to authenticated
using (true)
with check (true);

drop policy if exists dev_authenticated_all on public.prescription_details;
create policy dev_authenticated_all
on public.prescription_details
for all
to authenticated
using (true)
with check (true);

-- API 역할에 테이블 접근 권한 (anon 키 사용 시 필요)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.prescriptions to anon, authenticated;
grant select, insert, update, delete on public.prescription_details to anon, authenticated;

drop policy if exists dev_anon_all on public.prescriptions;
create policy dev_anon_all
on public.prescriptions
for all
to anon
using (true)
with check (true);

drop policy if exists dev_anon_all on public.prescription_details;
create policy dev_anon_all
on public.prescription_details
for all
to anon
using (true)
with check (true);

commit;
