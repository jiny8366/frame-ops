-- FRAME OPS — 스태프 자체 패스워드 인증 (커스텀 auth, Supabase Auth 비의존)
-- 로그인: 지점코드 + 직원 패스워드. 결제 확정 시 담당자 패스워드 재인증.
-- user_id 의 auth.users FK 를 제거하여 자체 UUID 로 동작 가능하게 함.

begin;

-- 1. 기존 auth.users FK 제거 (커스텀 auth 로 전환)
alter table public.fo_staff_profiles
  drop constraint if exists fo_staff_profiles_user_id_fkey;

alter table public.fo_staff_store_scopes
  drop constraint if exists fo_staff_store_scopes_user_id_fkey;

-- 2. user_id 기본값 자동 생성 (신규 직원 생성 시 명시 불필요)
alter table public.fo_staff_profiles
  alter column user_id set default gen_random_uuid();

-- 3. 패스워드 컬럼 추가
alter table public.fo_staff_profiles
  add column if not exists password_hash text,
  add column if not exists password_updated_at timestamptz;

create index if not exists idx_fo_staff_profiles_login_id on public.fo_staff_profiles (login_id);

-- 4. login_id UNIQUE 보장 (시드 ON CONFLICT 사용 전 필수)
do $u$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fo_staff_profiles_login_id_key'
  ) then
    alter table public.fo_staff_profiles add constraint fo_staff_profiles_login_id_key unique (login_id);
  end if;
end $u$;

-- 5. 시드 — BKC01 매장 테스트 계정 (password: 1234)
--    실제 비밀번호는 `node -e "console.log(require('bcryptjs').hashSync('YOUR_PW',10))"` 로 생성.
do $seed$
declare
  v_store_id uuid;
  v_user_id uuid;
begin
  select id into v_store_id from public.fo_stores where store_code = 'BKC01' limit 1;
  if v_store_id is null then
    raise notice '시드 스킵: store_code=BKC01 매장이 없음';
    return;
  end if;

  -- 동일 login_id 면 업데이트, 없으면 삽입
  insert into public.fo_staff_profiles (
    login_id, display_name, role_code, password_hash, password_updated_at, active
  ) values (
    'admin', '관리자', 'store_manager',
    '$2b$10$GYX1nK6IMf3rMTa/fB0obOFCUYCYeUgMnUpAJV40W.G/nZFMKNBEu',
    now(), true
  )
  on conflict (login_id) do update set
    password_hash = excluded.password_hash,
    password_updated_at = excluded.password_updated_at,
    active = true
  returning user_id into v_user_id;

  -- 매장 스코프 연결
  if v_user_id is not null then
    insert into public.fo_staff_store_scopes (user_id, store_id)
    values (v_user_id, v_store_id)
    on conflict do nothing;
    raise notice '시드 완료: user_id=%, store=BKC01, password=1234', v_user_id;
  end if;
end $seed$;

commit;
