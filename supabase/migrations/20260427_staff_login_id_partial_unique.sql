-- FRAME OPS — fo_staff_profiles.login_id UNIQUE 정책 재정의.
--
-- 배경:
--   지점 계정은 매장 store_code 를 공유 login_id 로 사용 (e.g. "BKC01"). 같은 매장의 모든
--   판매사/직원이 동일 login_id 를 갖고 비밀번호로만 구별. 따라서 login_id 의 전역 UNIQUE
--   는 의도와 충돌 — 두 번째 이상 직원 등록이 실패함.
--
-- 변경:
--   1) 기존 UNIQUE (login_id) 제거.
--   2) 본사(hq_*) 계정만 login_id 가 unique 하도록 partial unique index 추가.
--      (지점 계정은 store_code 와 password 조합으로 구별; 매장 단위 password 유일성은
--       앱 레이어에서 강제, /api/auth/login 의 store_code 조회로 식별)
--
-- 호환성:
--   - 기존 hq_* 행들의 login_id 가 모두 unique 인 경우 마이그레이션 무손실.
--   - 새 partial unique 는 NULL login_id 도 허용 (store 계정 중 일부가 NULL 이어도 OK).

begin;

alter table public.fo_staff_profiles
  drop constraint if exists fo_staff_profiles_login_id_key;

create unique index if not exists fo_staff_profiles_login_id_hq_uk
  on public.fo_staff_profiles (login_id)
  where role_code like 'hq_%' and login_id is not null;

commit;
