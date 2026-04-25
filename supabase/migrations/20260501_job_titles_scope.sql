-- FRAME OPS — fo_staff_job_titles 에 scope 추가 + 지점 직급(매니저/판매사) 등록
-- scope 'hq'   : 본사 역할 전용 직급 (대표이사, 관리자, 회계담당 등)
-- scope 'store': 지점 역할 전용 직급 (매니저, 판매사)
-- scope 'both' : 양쪽 공통

begin;

alter table public.fo_staff_job_titles
  add column if not exists scope text not null default 'both'
    check (scope in ('hq', 'store', 'both'));

-- 기존 직급 → 본사 전용으로 분류
update public.fo_staff_job_titles
   set scope = 'hq'
 where code in ('ceo', 'manager', 'accounting');

-- 지점 직급 추가
insert into public.fo_staff_job_titles (code, label, sort_order, active, scope)
values
  ('store_mgr',   '매니저', 100, true, 'store'),
  ('salesperson', '판매사', 110, true, 'store')
on conflict (code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  active = excluded.active,
  scope = excluded.scope;

commit;
