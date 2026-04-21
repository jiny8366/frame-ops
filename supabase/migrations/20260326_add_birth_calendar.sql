-- 생년월일 입력 방식(양력/음력) 표시용 메타
begin;

alter table public.customers
  add column if not exists birth_calendar text default 'solar';

comment on column public.customers.birth_calendar is 'solar | lunar';

commit;
