-- FRAME OPS: 반품·손망실, 정산 시재/지출 컬럼, 매장 간 이동(승인)

begin;

-- ── 반품 ──
create table if not exists public.fo_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.fo_stores (id) on delete restrict,
  original_sale_id uuid references public.fo_sales (id) on delete set null,
  returned_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_returns_store on public.fo_returns (store_id, returned_at desc);

create table if not exists public.fo_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.fo_returns (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_price integer not null default 0,
  is_damage_loss boolean not null default false
);

create index if not exists idx_fo_return_lines_return on public.fo_return_lines (return_id);

create index if not exists idx_fo_return_lines_damage on public.fo_return_lines (return_id) where is_damage_loss = true;

-- ── 정산 상세(기존 fo_settlements 확장) ──
alter table public.fo_settlements
  add column if not exists cash_expected integer,
  add column if not exists cash_counted integer,
  add column if not exists variance integer;

create table if not exists public.fo_settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.fo_settlements (id) on delete cascade,
  amount integer not null,
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_fo_settlement_expenses_settlement on public.fo_settlement_expenses (settlement_id);

-- ── 매장 간 이동 (발송 후 수신 측 승인) ──
create table if not exists public.fo_interstore_transfers (
  id uuid primary key default gen_random_uuid(),
  from_store_id uuid not null references public.fo_stores (id) on delete restrict,
  to_store_id uuid not null references public.fo_stores (id) on delete restrict,
  document_at timestamptz not null,
  status text not null default 'pending_approval',
  note text,
  hold_note text,
  reject_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint chk_fo_interstore_diff check (from_store_id <> to_store_id),
  constraint chk_fo_interstore_status check (
    status in ('pending_approval', 'on_hold', 'approved', 'rejected')
  )
);

create index if not exists idx_fo_interstore_from on public.fo_interstore_transfers (from_store_id, created_at desc);
create index if not exists idx_fo_interstore_to_status on public.fo_interstore_transfers (to_store_id, status);

create table if not exists public.fo_interstore_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.fo_interstore_transfers (id) on delete cascade,
  product_id uuid not null references public.fo_products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_cost integer not null default 0
);

create index if not exists idx_fo_interstore_lines_transfer on public.fo_interstore_transfer_lines (transfer_id);

-- RLS
alter table public.fo_returns enable row level security;
alter table public.fo_return_lines enable row level security;
alter table public.fo_settlement_expenses enable row level security;
alter table public.fo_interstore_transfers enable row level security;
alter table public.fo_interstore_transfer_lines enable row level security;

do $pol$
declare
  t text;
begin
  foreach t in array array[
    'fo_returns', 'fo_return_lines', 'fo_settlement_expenses',
    'fo_interstore_transfers', 'fo_interstore_transfer_lines'
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

grant select, insert, update, delete on public.fo_returns to anon, authenticated;
grant select, insert, update, delete on public.fo_return_lines to anon, authenticated;
grant select, insert, update, delete on public.fo_settlement_expenses to anon, authenticated;
grant select, insert, update, delete on public.fo_interstore_transfers to anon, authenticated;
grant select, insert, update, delete on public.fo_interstore_transfer_lines to anon, authenticated;

commit;
