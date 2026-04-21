-- FRAME OPS: 입고·출고·조정 이력, 적정재고

begin;

-- 입고 전표
create table if not exists public.fo_inbound_receipts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  supplier_id uuid references public.fo_suppliers (id) on delete set null,
  document_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_inbound_store_doc on public.fo_inbound_receipts (store_id, document_at desc);

create table if not exists public.fo_inbound_lines (
  id uuid primary key default gen_random_uuid(),
  inbound_receipt_id uuid not null references public.fo_inbound_receipts (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_cost integer not null default 0,
  sale_price_override integer
);

create index if not exists idx_fo_inbound_lines_receipt on public.fo_inbound_lines (inbound_receipt_id);

-- 출고 전표 (판매 외)
create table if not exists public.fo_outbound_shipments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  reason text not null default '',
  note text,
  document_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_outbound_store_doc on public.fo_outbound_shipments (store_id, document_at desc);

create table if not exists public.fo_outbound_lines (
  id uuid primary key default gen_random_uuid(),
  outbound_shipment_id uuid not null references public.fo_outbound_shipments (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null
);

create index if not exists idx_fo_outbound_lines_shipment on public.fo_outbound_lines (outbound_shipment_id);

-- 재고 조정 (삭제 없이 이력만 적재)
create table if not exists public.fo_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  reason text not null default '',
  note text,
  document_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_adj_store_doc on public.fo_stock_adjustments (store_id, document_at desc);

create table if not exists public.fo_stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references public.fo_stock_adjustments (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity_delta numeric(14, 2) not null
);

create index if not exists idx_fo_adj_lines_adj on public.fo_stock_adjustment_lines (stock_adjustment_id);

-- 적정재고 (지점×상품)
create table if not exists public.fo_stock_targets (
  store_id uuid not null references public.fo_stores (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete cascade,
  optimal_quantity numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id)
);

drop trigger if exists trg_fo_stock_targets_updated on public.fo_stock_targets;
create trigger trg_fo_stock_targets_updated
before update on public.fo_stock_targets
for each row execute function public.set_updated_at();

-- RLS
alter table public.fo_inbound_receipts enable row level security;
alter table public.fo_inbound_lines enable row level security;
alter table public.fo_outbound_shipments enable row level security;
alter table public.fo_outbound_lines enable row level security;
alter table public.fo_stock_adjustments enable row level security;
alter table public.fo_stock_adjustment_lines enable row level security;
alter table public.fo_stock_targets enable row level security;

do $pol$
declare
  t text;
begin
  foreach t in array array[
    'fo_inbound_receipts', 'fo_inbound_lines',
    'fo_outbound_shipments', 'fo_outbound_lines',
    'fo_stock_adjustments', 'fo_stock_adjustment_lines',
    'fo_stock_targets'
  ]
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

grant select, insert, update, delete on public.fo_inbound_receipts to anon, authenticated;
grant select, insert, update, delete on public.fo_inbound_lines to anon, authenticated;
grant select, insert, update, delete on public.fo_outbound_shipments to anon, authenticated;
grant select, insert, update, delete on public.fo_outbound_lines to anon, authenticated;
grant select, insert, update, delete on public.fo_stock_adjustments to anon, authenticated;
grant select, insert, update, delete on public.fo_stock_adjustment_lines to anon, authenticated;
grant select, insert, update, delete on public.fo_stock_targets to anon, authenticated;

commit;
