-- FRAME OPS: 판매 기반 발주서(주문서) · 라인별 매입/보류 상태

begin;

create table if not exists public.fo_purchase_order_sheets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  title text not null default '',
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_po_sheets_store_created
  on public.fo_purchase_order_sheets (store_id, created_at desc);

-- line_status: pending=매입 대기(계속 노출), received=매입완료, deferred=보류(다음에 안 보임)
create table if not exists public.fo_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.fo_purchase_order_sheets (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  line_status text not null default 'pending'
    check (line_status in ('pending', 'received', 'deferred')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fo_po_lines_sheet on public.fo_purchase_order_lines (sheet_id);
create index if not exists idx_fo_po_lines_status on public.fo_purchase_order_lines (line_status);

drop trigger if exists trg_fo_purchase_order_lines_updated on public.fo_purchase_order_lines;
create trigger trg_fo_purchase_order_lines_updated
before update on public.fo_purchase_order_lines
for each row execute function public.set_updated_at();

alter table public.fo_purchase_order_sheets enable row level security;
alter table public.fo_purchase_order_lines enable row level security;

do $pol$
declare
  t text;
begin
  foreach t in array array['fo_purchase_order_sheets', 'fo_purchase_order_lines']
  loop
    execute format('drop policy if exists fo_dev_authenticated_all on public.%I', t);
    execute format(
      'create policy fo_dev_authenticated_all on public.%I for all to authenticated using (true) with check (true)',
      t
    );
    execute format('drop policy if exists fo_dev_anon_all on public.%I', t);
    execute format(
      'create policy fo_dev_anon_all on public.%I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $pol$;

grant select, insert, update, delete on public.fo_purchase_order_sheets to anon, authenticated;
grant select, insert, update, delete on public.fo_purchase_order_lines to anon, authenticated;

commit;
