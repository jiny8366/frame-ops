-- FRAME OPS — 재고조정표 확정 워크플로
begin;

alter table public.fo_stock_adjustments
  add column if not exists status text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users (id) on delete set null,
  add column if not exists confirmed_by_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fo_stock_adjustments_status_chk'
  ) then
    alter table public.fo_stock_adjustments
      add constraint fo_stock_adjustments_status_chk
      check (status in ('draft', 'confirmed'));
  end if;
end $$;

create index if not exists idx_fo_adj_store_status_doc
  on public.fo_stock_adjustments (store_id, status, document_at desc);

-- 기존 데이터는 이미 저장 시점에 재고 반영된 이력으로 간주
update public.fo_stock_adjustments
set status = 'confirmed'
where status is null;

alter table public.fo_stock_adjustments
  alter column status set default 'draft',
  alter column status set not null;

commit;
