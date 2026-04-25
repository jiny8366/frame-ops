-- FRAME OPS Phase B2 — create_inbound_receipt RPC
-- 매입 등록: fo_inbound_receipts + fo_inbound_lines 생성 + fo_products.stock_quantity 증가 원자 처리.
-- 입력 lines: [{ product_id, quantity, unit_cost? }]

begin;

-- 동명 함수 사전 정리 (오버로드 방지)
do $cleanup$
declare
  r record;
begin
  for r in
    select oid::regprocedure as fn_sig
    from pg_proc
    where proname = 'create_inbound_receipt'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.fn_sig::text || ' cascade';
  end loop;
end $cleanup$;

create function create_inbound_receipt(
  p_store_id uuid,
  p_supplier_id uuid default null,
  p_document_at timestamptz default null,
  p_note text default null,
  p_lines jsonb default '[]'::jsonb
)
returns table (
  receipt_id uuid,
  lines_created int,
  total_cost bigint
)
language plpgsql
as $$
declare
  v_receipt_id uuid;
  v_lines_count int;
  v_doc_at timestamptz := coalesce(p_document_at, now());
  v_total bigint;
begin
  if p_store_id is null then
    raise exception 'store_id 는 필수입니다';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception '입고 항목 (lines) 은 최소 1개 이상이어야 합니다';
  end if;

  insert into fo_inbound_receipts (store_id, supplier_id, document_at, note)
  values (p_store_id, p_supplier_id, v_doc_at, p_note)
  returning id into v_receipt_id;

  insert into fo_inbound_lines (inbound_receipt_id, product_id, quantity, unit_cost)
  select
    v_receipt_id,
    (l->>'product_id')::uuid,
    (l->>'quantity')::numeric,
    coalesce((l->>'unit_cost')::numeric, 0)
  from jsonb_array_elements(p_lines) as l;

  get diagnostics v_lines_count = row_count;

  -- 재고 증가 (NULL 도 0 으로 시작)
  update fo_products p
  set stock_quantity = coalesce(p.stock_quantity, 0)::numeric + (l->>'quantity')::numeric
  from jsonb_array_elements(p_lines) as l
  where p.id = (l->>'product_id')::uuid;

  -- 총 매입 원가 합산
  select coalesce(sum((l->>'quantity')::numeric * coalesce((l->>'unit_cost')::numeric, 0)), 0)::bigint
  into v_total
  from jsonb_array_elements(p_lines) as l;

  return query select v_receipt_id, v_lines_count, v_total;
end;
$$;

grant execute on function create_inbound_receipt(uuid, uuid, timestamptz, text, jsonb) to service_role;

commit;
