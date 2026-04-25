-- FRAME OPS — fo_sale_items RLS 정책 누락 수정
-- 증상: POS 결제 시 'new row violates row-level security policy' 오류
-- 원인: fo_sale_items 에 RLS 활성화돼 있지만 정책이 하나도 없어 모든 write 차단

begin;

alter table public.fo_sale_items enable row level security;

drop policy if exists fo_dev_authenticated_all on public.fo_sale_items;
create policy fo_dev_authenticated_all
  on public.fo_sale_items for all to authenticated using (true) with check (true);

drop policy if exists fo_dev_anon_all on public.fo_sale_items;
create policy fo_dev_anon_all
  on public.fo_sale_items for all to anon using (true) with check (true);

grant select, insert, update, delete on public.fo_sale_items to anon, authenticated;

commit;
