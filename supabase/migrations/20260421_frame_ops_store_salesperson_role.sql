-- 지점 판매사 역할 (매니저와 구분)

begin;

insert into public.fo_staff_roles (code, label, description, sort_order) values
  ('store_salesperson', '지점 판매사', '해당 지점 POS·판매 입력', 45)
on conflict (code) do nothing;

commit;
