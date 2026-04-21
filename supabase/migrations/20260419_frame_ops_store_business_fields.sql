-- FRAME OPS: 지점 상호 외 사업자등록번호·주소·전화 (주문서 표기용)

begin;

alter table public.fo_stores
  add column if not exists business_reg_no text not null default '';

alter table public.fo_stores
  add column if not exists address text not null default '';

alter table public.fo_stores
  add column if not exists phone text not null default '';

commit;
