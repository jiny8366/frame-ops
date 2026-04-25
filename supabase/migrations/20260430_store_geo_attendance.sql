-- FRAME OPS — 매장 좌표 기반 출퇴근 (모바일 전용)
-- 1. fo_stores 에 lat/lng/반경/활성 컬럼 추가
-- 2. fo_attendance 테이블 생성

begin;

-- 1. 매장 좌표·반경 컬럼
alter table public.fo_stores
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geo_radius_m int default 200,
  add column if not exists geo_required boolean default false;

-- 2. 출퇴근 기록
create table if not exists public.fo_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  store_id uuid not null references public.fo_stores (id) on delete cascade,
  event text not null check (event in ('clock_in', 'clock_out')),
  occurred_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  distance_m int,
  user_agent text
);

create index if not exists idx_fo_attendance_user_at
  on public.fo_attendance (user_id, occurred_at desc);
create index if not exists idx_fo_attendance_store_at
  on public.fo_attendance (store_id, occurred_at desc);

alter table public.fo_attendance enable row level security;

drop policy if exists fo_dev_authenticated_all on public.fo_attendance;
create policy fo_dev_authenticated_all on public.fo_attendance
  for all to authenticated using (true) with check (true);

drop policy if exists fo_dev_anon_all on public.fo_attendance;
create policy fo_dev_anon_all on public.fo_attendance
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.fo_attendance to anon, authenticated;

commit;
