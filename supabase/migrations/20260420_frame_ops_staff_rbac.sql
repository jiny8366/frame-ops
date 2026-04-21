-- FRAME OPS — 본사·지점 스태프 역할·프로필·지점 범위 (Supabase Auth user_id 연동)
-- Auth 사용자 생성/삭제는 앱에서 service_role + auth.admin API 로만 수행할 것.

begin;

-- 역할 정의 (앱에서 담당 구분용; RLS 강제는 추후 JWT·정책으로 확장 가능)
create table if not exists public.fo_staff_roles (
  code text primary key,
  label text not null,
  description text,
  sort_order integer not null default 0
);

insert into public.fo_staff_roles (code, label, description, sort_order) values
  ('hq_super', '본사 총괄', '본사 전 기능·설정(계정·권한 포함)', 10),
  ('hq_purchase', '본사 매입·발주', '주문·매입·발주 중심', 20),
  ('hq_view', '본사 열람', '통계·리포트·조회 위주', 30),
  ('store_manager', '지점 관리', '해당 지점 운영·재고·POS', 40),
  ('store_staff', '지점 스태프', 'POS·일상 입력', 50)
on conflict (code) do nothing;

create table if not exists public.fo_staff_profiles (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role_code text not null references public.fo_staff_roles (code) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fo_staff_profiles_role on public.fo_staff_profiles (role_code);
create index if not exists idx_fo_staff_profiles_active on public.fo_staff_profiles (active) where active = true;

create table if not exists public.fo_staff_store_scopes (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references public.fo_stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create index if not exists idx_fo_staff_store_scopes_store on public.fo_staff_store_scopes (store_id);

drop trigger if exists trg_fo_staff_profiles_updated on public.fo_staff_profiles;
create trigger trg_fo_staff_profiles_updated
before update on public.fo_staff_profiles
for each row execute function public.set_updated_at();

alter table public.fo_staff_roles enable row level security;
alter table public.fo_staff_profiles enable row level security;
alter table public.fo_staff_store_scopes enable row level security;

do $pol$
declare
  t text;
begin
  foreach t in array array['fo_staff_roles', 'fo_staff_profiles', 'fo_staff_store_scopes']
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

grant select, insert, update, delete on public.fo_staff_roles to anon, authenticated;
grant select, insert, update, delete on public.fo_staff_profiles to anon, authenticated;
grant select, insert, update, delete on public.fo_staff_store_scopes to anon, authenticated;

commit;
