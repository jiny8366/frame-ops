-- FRAME OPS — fo_staff_profiles.password_plain 추가
-- 지점 계정 비밀번호 본사 관리자 가시성 + 중복 검사용 평문 보관.
-- 본사 역할(hq_*)에는 사용하지 않음 — 본사 계정은 평문 저장 안 함.
-- bcrypt password_hash 는 그대로 유지 (실제 인증은 hash 로 검증).

begin;

alter table public.fo_staff_profiles
  add column if not exists password_plain text;

-- 활성 지점 계정 평문 비밀번호의 중복을 빠르게 식별하기 위한 인덱스.
create index if not exists fo_staff_profiles_store_pwd_idx
  on public.fo_staff_profiles (password_plain)
  where role_code like 'store_%' and active = true and password_plain is not null;

commit;
