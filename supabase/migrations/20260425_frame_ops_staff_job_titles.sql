-- FRAME OPS — 직급 마스터(표시명 수정·추가) + 스태프 프로필(전화·로그인 아이디·직급)
-- Auth 로그인은 이메일·비밀번호 기준; login_id·phone 은 프로필·메타데이터에 보관.

begin;

create table if not exists public.fo_staff_job_titles (
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.fo_staff_job_titles (code, label, sort_order) values
  ('ceo', '대표이사', 10),
  ('manager', '관리자', 20),
  ('accounting', '회계담당', 30)
on conflict (code) do nothing;

-- 역할 안내(fo_staff_roles) 기본 표시/설명 보강
-- 선행 마이그레이션(20260420)이 없으면 건너뜁니다.
do $roles$
begin
  if to_regclass('public.fo_staff_roles') is not null then
    insert into public.fo_staff_roles (code, label, description, sort_order) values
      ('hq_super', '본사 총괄', '본사 전 기능·설정(계정·권한 포함)', 10),
      ('hq_purchase', '본사 매입·발주', '주문·매입·발주 중심', 20),
      ('hq_view', '본사 열람', '통계·리포트·조회 위주', 30),
      ('store_manager', '지점 관리', '해당 지점 운영·재고·POS', 40),
      ('store_staff', '지점 스태프', 'POS·일상 입력', 50)
    on conflict (code) do update set
      label = excluded.label,
      description = excluded.description,
      sort_order = excluded.sort_order;
  end if;
end $roles$;

alter table public.fo_staff_profiles
  add column if not exists job_title_code text references public.fo_staff_job_titles (code) on delete restrict,
  add column if not exists phone text,
  add column if not exists login_id text;

create index if not exists idx_fo_staff_profiles_job_title on public.fo_staff_profiles (job_title_code);

alter table public.fo_staff_job_titles enable row level security;

do $pol$
begin
  execute 'drop policy if exists fo_dev_authenticated_all on public.fo_staff_job_titles';
  execute
    'create policy fo_dev_authenticated_all on public.fo_staff_job_titles '
    'for all to authenticated using (true) with check (true)';
  execute 'drop policy if exists fo_dev_anon_all on public.fo_staff_job_titles';
  execute
    'create policy fo_dev_anon_all on public.fo_staff_job_titles '
    'for all to anon using (true) with check (true)';
end $pol$;

grant select, insert, update, delete on public.fo_staff_job_titles to anon, authenticated;

commit;
