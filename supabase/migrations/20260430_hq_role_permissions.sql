-- FRAME OPS Phase G1 — 본사 포털 + 메뉴별 권한 + hq_admin 시드
-- 1. fo_staff_profiles 에 permissions text[] 컬럼 추가 (NULL = role 기본값)
-- 2. hq_admin (hq_super) 시드 — password 9999, BKC01 매장 스코프
-- 3. fo_staff_profiles 의 user_id_fkey 가 이미 제거되었으므로 추가 변경 없음

begin;

-- 1. permissions 컬럼 (NULL = role 기본값 사용; 명시값이 있으면 우선)
alter table public.fo_staff_profiles
  add column if not exists permissions text[];

-- 2. hq_admin 시드 (이미 있으면 갱신, 매장 스코프도 보장)
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

  insert into public.fo_staff_profiles (
    login_id, display_name, role_code, password_hash, password_updated_at, active
  ) values (
    'hq_admin', '본사 관리자', 'hq_super',
    '$2b$10$FnFc8/xa6sXuM4g5G4o9iugyRkIwmkZ69yyRdGbqYCxBlA3GixUkm',
    now(), true
  )
  on conflict (login_id) do update set
    role_code = 'hq_super',
    -- 비밀번호는 기존 변경값을 보존 (NULL 또는 이전과 동일하면 새 해시로 채움)
    password_hash = coalesce(public.fo_staff_profiles.password_hash, excluded.password_hash),
    password_updated_at = coalesce(public.fo_staff_profiles.password_updated_at, excluded.password_updated_at),
    active = true
  returning user_id into v_user_id;

  -- 매장 스코프 연결 (BKC01 - 추후 본사 가상 매장 마이그레이션 가능)
  if v_user_id is not null then
    insert into public.fo_staff_store_scopes (user_id, store_id)
    values (v_user_id, v_store_id)
    on conflict do nothing;
    raise notice '시드 완료: hq_admin user_id=%, password=9999 (BKC01 매장 진입)', v_user_id;
  end if;
end $seed$;

commit;
